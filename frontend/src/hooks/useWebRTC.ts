'use client';

import * as React from 'react';
import { socketClient } from '../services/socket.client';
import { useAuthStore } from '../stores/auth.store';
import { useCallStore } from '../stores/call.store';
import type { CallParticipant, CallType } from '../types/call.types';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

// Module-level singletons for active media and peer connection
let peerConnection: RTCPeerConnection | null = null;
let localMediaStream: MediaStream | null = null;
let iceCandidateQueue: RTCIceCandidateInit[] = [];

/**
 * Clean up active RTCPeerConnection and stop all hardware media tracks.
 */
function cleanupConnection() {
  if (peerConnection) {
    try {
      peerConnection.close();
    } catch {
      // Ignored
    }
    peerConnection = null;
  }

  if (localMediaStream) {
    try {
      localMediaStream.getTracks().forEach((track) => track.stop());
    } catch {
      // Ignored
    }
    localMediaStream = null;
  }

  iceCandidateQueue = [];
  useCallStore.getState().resetCall();
}

/**
 * Custom React Hook for WebRTC 1-to-1 Audio/Video Call Signaling.
 * 
 * Orchestrates RTCPeerConnection lifecycle, getUserMedia acquisition,
 * Trickle ICE candidate relay, and session state transitions.
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
 */
export function useWebRTC() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const {
    sessionState,
    callId,
    peerUser,
    callType,
    incomingOffer,
    setIncomingCall,
    setOutgoingCall,
    setConnecting,
    setConnected,
    setLocalStream,
    setRemoteStream,
    incrementDuration,
  } = useCallStore();

  // Active call duration timer
  React.useEffect(() => {
    if (sessionState !== 'CONNECTED') return;

    const interval = setInterval(() => {
      incrementDuration();
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionState, incrementDuration]);

  // Bind Socket Signaling Listeners
  React.useEffect(() => {
    if (!isAuthenticated) return;

    const socket = socketClient.connect();

    // 1. Incoming Call Event
    const onIncomingCall = (payload: {
      callId: string;
      caller: CallParticipant;
      type: CallType;
      offerSdp: RTCSessionDescriptionInit;
      conversationId?: string;
    }) => {
      setIncomingCall(payload);
    };

    // 2. Callee Accepted Event (Received by Caller)
    const onCallAccepted = async (payload: {
      callId: string;
      answerSdp: RTCSessionDescriptionInit;
    }) => {
      if (peerConnection) {
        try {
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(payload.answerSdp)
          );
          // Flush pending queued ICE candidates
          while (iceCandidateQueue.length > 0) {
            const cand = iceCandidateQueue.shift();
            if (cand) {
              await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
            }
          }
          setConnected();
        } catch (err) {
          console.error('[WebRTC] Error applying remote answer:', err);
        }
      }
    };

    // 3. ICE Candidate Event
    const onIceCandidate = async (payload: {
      callId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      if (payload.candidate) {
        if (peerConnection && peerConnection.remoteDescription) {
          try {
            await peerConnection.addIceCandidate(
              new RTCIceCandidate(payload.candidate)
            );
          } catch (err) {
            console.warn('[WebRTC] Error adding ICE candidate:', err);
          }
        } else {
          iceCandidateQueue.push(payload.candidate);
        }
      }
    };

    // 4. Call Terminated / Rejected / Missed Events
    const onCallEnded = () => cleanupConnection();
    const onCallRejected = () => cleanupConnection();
    const onCallMissed = () => cleanupConnection();

    socket.on('call:incoming', onIncomingCall);
    socket.on('call:accepted', onCallAccepted);
    socket.on('call:ice-candidate', onIceCandidate);
    socket.on('call:ended', onCallEnded);
    socket.on('call:rejected', onCallRejected);
    socket.on('call:missed', onCallMissed);

    return () => {
      socket.off('call:incoming', onIncomingCall);
      socket.off('call:accepted', onCallAccepted);
      socket.off('call:ice-candidate', onIceCandidate);
      socket.off('call:ended', onCallEnded);
      socket.off('call:rejected', onCallRejected);
      socket.off('call:missed', onCallMissed);
    };
  }, [isAuthenticated, setIncomingCall, setConnected]);

  // Initiate Outgoing Call
  const startCall = React.useCallback(
    async (
      recipient: CallParticipant,
      type: CallType,
      conversationId?: string
    ) => {
      try {
        setConnecting();

        // 1. Acquire local camera / microphone stream
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'VIDEO',
        });
        localMediaStream = stream;
        setLocalStream(stream);

        // 2. Initialize RTCPeerConnection
        const pc = new RTCPeerConnection(RTC_CONFIG);
        peerConnection = pc;

        // Add local tracks to peer connection
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Listen for remote audio/video tracks
        pc.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            setRemoteStream(event.streams[0]);
          }
        };

        // Emit Trickle ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate && recipient.id) {
            const socket = socketClient.getSocket();
            socket?.emit('call:ice-candidate', {
              callId: useCallStore.getState().callId,
              targetUserId: recipient.id,
              candidate: event.candidate,
            });
          }
        };

        // 3. Create and set local SDP Offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // 4. Emit initiation payload to backend
        const socket = socketClient.getSocket();
        socket?.emit(
          'call:initiate',
          {
            recipientId: recipient.id,
            type,
            offerSdp: offer,
            conversationId,
          },
          (res?: { callId: string }) => {
            if (res?.callId) {
              setOutgoingCall({
                callId: res.callId,
                recipient,
                type,
                conversationId,
              });
            }
          }
        );

        setOutgoingCall({
          callId: 'pending',
          recipient,
          type,
          conversationId,
        });
      } catch (err) {
        console.error('[WebRTC] Failed to start call:', err);
        cleanupConnection();
      }
    },
    [setConnecting, setLocalStream, setRemoteStream, setOutgoingCall]
  );

  // Accept Incoming Call
  const acceptCall = React.useCallback(async () => {
    if (!callId || !incomingOffer || !peerUser) return;

    try {
      setConnecting();

      // 1. Acquire local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'VIDEO',
      });
      localMediaStream = stream;
      setLocalStream(stream);

      // 2. Initialize RTCPeerConnection
      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnection = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && peerUser.id) {
          const socket = socketClient.getSocket();
          socket?.emit('call:ice-candidate', {
            callId,
            targetUserId: peerUser.id,
            candidate: event.candidate,
          });
        }
      };

      // 3. Apply Remote SDP Offer & Create SDP Answer
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));

      // Flush any queued candidates
      while (iceCandidateQueue.length > 0) {
        const cand = iceCandidateQueue.shift();
        if (cand) {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // 4. Emit Call Accepted event with SDP Answer
      const socket = socketClient.getSocket();
      socket?.emit('call:accept', {
        callId,
        answerSdp: answer,
      });

      setConnected();
    } catch (err) {
      console.error('[WebRTC] Failed to accept call:', err);
      cleanupConnection();
    }
  }, [
    callId,
    incomingOffer,
    peerUser,
    callType,
    setConnecting,
    setLocalStream,
    setRemoteStream,
    setConnected,
  ]);

  // Reject Incoming Call
  const rejectCall = React.useCallback(
    (reason: 'DECLINED' | 'BUSY' = 'DECLINED') => {
      if (callId) {
        const socket = socketClient.getSocket();
        socket?.emit('call:reject', { callId, reason });
      }
      cleanupConnection();
    },
    [callId]
  );

  // Terminate Active Call
  const endCall = React.useCallback(() => {
    if (callId) {
      const socket = socketClient.getSocket();
      socket?.emit('call:end', { callId });
    }
    cleanupConnection();
  }, [callId]);

  return {
    sessionState,
    callId,
    peerUser,
    callType,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  };
}

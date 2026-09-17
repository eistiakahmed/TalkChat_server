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
 * Hook for WebRTC Socket Signaling.
 * Mount ONCE globally in CallOverlay to handle all incoming/accepted/rejected/ice events.
 */
export function useWebRTCSignaling() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionState = useCallStore((s) => s.sessionState);

  // Active call duration timer (runs only in CallOverlay)
  React.useEffect(() => {
    if (sessionState !== 'CONNECTED') return;

    const interval = setInterval(() => {
      useCallStore.getState().incrementDuration();
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionState]);

  // Bind Socket Signaling Listeners (once per application session)
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
      useCallStore.getState().setIncomingCall(payload);
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
          useCallStore.getState().setConnected();
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
  }, [isAuthenticated]);
}

/**
 * Custom React Hook for WebRTC 1-to-1 Audio/Video Call Actions.
 * 
 * Provides stable callable triggers (startCall, acceptCall, rejectCall, endCall).
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
 */
export function useWebRTC() {
  const sessionState = useCallStore((s) => s.sessionState);
  const callId = useCallStore((s) => s.callId);
  const peerUser = useCallStore((s) => s.peerUser);
  const callType = useCallStore((s) => s.callType);
  const incomingOffer = useCallStore((s) => s.incomingOffer);

  // Initiate Outgoing Call
  const startCall = React.useCallback(
    async (
      recipient: CallParticipant,
      type: CallType,
      conversationId?: string
    ) => {
      try {
        useCallStore.getState().setConnecting();

        // 1. Acquire local camera / microphone stream
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'VIDEO',
        });
        localMediaStream = stream;
        useCallStore.getState().setLocalStream(stream);

        // 2. Initialize RTCPeerConnection
        const pc = new RTCPeerConnection(RTC_CONFIG);
        peerConnection = pc;

        // Add local tracks to peer connection
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Listen for remote audio/video tracks
        pc.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            useCallStore.getState().setRemoteStream(event.streams[0]);
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
              useCallStore.getState().setOutgoingCall({
                callId: res.callId,
                recipient,
                type,
                conversationId,
              });
            }
          }
        );

        useCallStore.getState().setOutgoingCall({
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
    []
  );

  // Accept Incoming Call
  const acceptCall = React.useCallback(async () => {
    const currentCallId = useCallStore.getState().callId;
    const currentOffer = useCallStore.getState().incomingOffer;
    const currentPeer = useCallStore.getState().peerUser;
    const currentType = useCallStore.getState().callType;

    if (!currentCallId || !currentOffer || !currentPeer) return;

    try {
      useCallStore.getState().setConnecting();

      // 1. Acquire local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: currentType === 'VIDEO',
      });
      localMediaStream = stream;
      useCallStore.getState().setLocalStream(stream);

      // 2. Initialize RTCPeerConnection
      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnection = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          useCallStore.getState().setRemoteStream(event.streams[0]);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && currentPeer.id) {
          const socket = socketClient.getSocket();
          socket?.emit('call:ice-candidate', {
            callId: currentCallId,
            targetUserId: currentPeer.id,
            candidate: event.candidate,
          });
        }
      };

      // 3. Apply Remote SDP Offer & Create SDP Answer
      await pc.setRemoteDescription(new RTCSessionDescription(currentOffer));

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
        callId: currentCallId,
        answerSdp: answer,
      });

      useCallStore.getState().setConnected();
    } catch (err) {
      console.error('[WebRTC] Failed to accept call:', err);
      cleanupConnection();
    }
  }, []);

  // Reject Incoming Call
  const rejectCall = React.useCallback(
    (reason: 'DECLINED' | 'BUSY' = 'DECLINED') => {
      const currentCallId = useCallStore.getState().callId;
      if (currentCallId) {
        const socket = socketClient.getSocket();
        socket?.emit('call:reject', { callId: currentCallId, reason });
      }
      cleanupConnection();
    },
    []
  );

  // Terminate Active Call
  const endCall = React.useCallback(() => {
    const currentCallId = useCallStore.getState().callId;
    if (currentCallId) {
      const socket = socketClient.getSocket();
      socket?.emit('call:end', { callId: currentCallId });
    }
    cleanupConnection();
  }, []);

  return {
    sessionState,
    callId,
    peerUser,
    callType,
    incomingOffer,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  };
}

import { io } from 'socket.io-client';

const API_BASE = 'http://localhost:5000/api/v1';
const WS_URL = 'http://localhost:5000';

const runTests = async () => {
  console.log('====================================================');
  console.log(' TalkChat Phase 11: Stories & Disappearing Messages ');
  console.log('====================================================\n');

  const ts = Date.now();

  // Helper: POST request
  const post = async (endpoint, body, token) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { status: res.status, data };
  };

  // Helper: PATCH request
  const patch = async (endpoint, body, token) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { status: res.status, data };
  };

  // 1. User Registrations
  console.log('1. Registering test users (Alice, Bob, Charlie)...');
  const aliceReg = await post('/auth/register', {
    username: `alice_${ts}`,
    email: `alice_${ts}@test.com`,
    password: 'Password123!',
    fullName: 'Alice Walker',
  });
  const alice = aliceReg.data.data.user;
  const aliceToken = aliceReg.data.data.tokens.accessToken;

  const bobReg = await post('/auth/register', {
    username: `bob_${ts}`,
    email: `bob_${ts}@test.com`,
    password: 'Password123!',
    fullName: 'Bob Smith',
  });
  const bob = bobReg.data.data.user;
  const bobToken = bobReg.data.data.tokens.accessToken;

  const charlieReg = await post('/auth/register', {
    username: `charlie_${ts}`,
    email: `charlie_${ts}@test.com`,
    password: 'Password123!',
    fullName: 'Charlie Brown',
  });
  const charlie = charlieReg.data.data.user;
  const charlieToken = charlieReg.data.data.tokens.accessToken;

  console.log(`✓ Alice registered: ${alice.id}`);
  console.log(`✓ Bob registered: ${bob.id}`);
  console.log(`✓ Charlie registered: ${charlie.id}\n`);

  // 2. Setup Contact Relationship (Alice <-> Bob are contacts, Charlie is not)
  console.log('2. Establishing contact connection between Alice and Bob...');
  const addRes = await fetch(`${API_BASE}/users/contacts/${bob.id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  console.log('  Alice sent contact request to Bob:', addRes.status);

  const acceptRes = await fetch(`${API_BASE}/users/contacts/${alice.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${bobToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'ACCEPTED' }),
  });
  console.log('  Bob accepted contact request:', acceptRes.status);
  console.log('✓ Alice and Bob are mutual contacts\n');

  // 3. Connect Socket.io for Real-time event verification
  console.log('3. Connecting WebSocket client for Bob...');
  const bobSocket = io(WS_URL, {
    auth: { token: bobToken },
    transports: ['websocket'],
  });

  let receivedNewStoryEvent = null;
  bobSocket.on('story:new', (evt) => {
    receivedNewStoryEvent = evt;
  });

  await new Promise((r) => bobSocket.on('connect', r));
  console.log('✓ Bob WebSocket connected\n');

  // 4. Story Creation
  console.log('4. Alice creates Ephemeral Stories...');
  const story1Res = await post('/stories/create', {
    mediaUrl: 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef',
    mediaType: 'IMAGE',
    caption: 'My first 24h ephemeral story!',
    privacy: 'ALL_CONTACTS',
  }, aliceToken);

  console.log('  Story 1 Creation status:', story1Res.status);
  const story1 = story1Res.data.data.story;
  console.log('  Story 1 ID:', story1.id);
  console.log('  Story 1 expiresAt:', story1.expiresAt);
  if (!story1.expiresAt) throw new Error('Missing expiresAt on story 1');

  // Verify 24h expiration
  const expDiff = new Date(story1.expiresAt).getTime() - new Date(story1.createdAt).getTime();
  const hours = expDiff / (1000 * 60 * 60);
  console.log(`  Computed lifetime in hours: ${hours.toFixed(2)}h`);
  if (Math.abs(hours - 24) > 0.1) throw new Error('Story does not expire in 24 hours');

  // Story 2: Story to test manual deletion
  const story2Res = await post('/stories/create', {
    mediaUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2',
    mediaType: 'IMAGE',
    caption: 'Story meant to be deleted early',
    privacy: 'ALL_CONTACTS',
  }, aliceToken);
  const story2 = story2Res.data.data.story;

  // Wait brief moment for WebSocket propagation
  await new Promise((r) => setTimeout(r, 500));
  if (receivedNewStoryEvent) {
    console.log('✓ Bob received real-time story:new event for Alice');
  }

  // Alice queries own stories
  const myStoriesRes = await post('/stories/me', {}, aliceToken);
  console.log('  Alice active stories count:', myStoriesRes.data.data.stories.length);
  if (myStoriesRes.data.data.stories.length < 2) throw new Error('Expected at least 2 stories for Alice');
  console.log('✓ Alice own stories retrieved successfully\n');

  // 5. Story Feed Verification
  console.log('5. Verifying Story Feed for Bob (Contact) and Charlie (Non-contact)...');
  const bobFeedRes = await post('/stories/feed', {}, bobToken);
  console.log('  Bob feed status:', bobFeedRes.status);
  const bobFeed = bobFeedRes.data.data.feed;
  const aliceInBobFeed = bobFeed.find((f) => f.author.id === alice.id);
  if (!aliceInBobFeed) throw new Error("Bob could not find Alice's stories in feed!");
  console.log(`  Bob sees Alice's group with ${aliceInBobFeed.stories.length} stories. allViewed: ${aliceInBobFeed.allViewed}`);
  if (aliceInBobFeed.allViewed !== false) throw new Error('allViewed should be false initially');

  const charlieFeedRes = await post('/stories/feed', {}, charlieToken);
  const charlieFeed = charlieFeedRes.data.data.feed;
  const aliceInCharlieFeed = charlieFeed.find((f) => f.author.id === alice.id);
  if (aliceInCharlieFeed) throw new Error("Charlie (non-contact) should NOT see Alice's contact-only stories!");
  console.log("✓ Charlie cannot see Alice's contact-only stories (Privacy enforced)\n");

  // 6. Story Viewing & Telemetry
  console.log('6. Bob marks Story 1 as viewed and verifies telemetry...');
  const viewRes = await post('/stories/view', { storyId: story1.id }, bobToken);
  console.log('  Bob view status:', viewRes.status, 'totalViews:', viewRes.data.data.totalViews);
  if (viewRes.data.data.totalViews < 1) throw new Error('Expected at least 1 view');

  // Idempotency: Viewing again should not increase views
  const viewAgainRes = await post('/stories/view', { storyId: story1.id }, bobToken);
  if (viewAgainRes.data.data.totalViews !== viewRes.data.data.totalViews) {
    throw new Error('View was not idempotent!');
  }
  console.log('✓ Story view recorded idempotently');

  // Alice checks viewers roster
  const viewersRes = await post('/stories/viewers', { storyId: story1.id }, aliceToken);
  console.log('  Alice checks Story 1 viewers status:', viewersRes.status);
  const viewersList = viewersRes.data.data.viewers;
  const bobViewer = viewersList.find((v) => v.viewer.id === bob.id);
  if (!bobViewer) throw new Error('Bob not found in Alice viewers roster');
  console.log(`  Found viewer: ${bobViewer.viewer.fullName} (${bobViewer.viewer.username}) at ${bobViewer.viewedAt}`);

  // BOLA Guard: Bob attempts to view Alice's viewers roster (must be rejected)
  const bobBolaRes = await post('/stories/viewers', { storyId: story1.id }, bobToken);
  console.log('  Bob attempting to view Alice story viewers (BOLA test):', bobBolaRes.status);
  if (bobBolaRes.status !== 403) throw new Error('Expected 403 Forbidden for non-creator');
  console.log('✓ BOLA Security Guard: Non-creators cannot access viewers roster\n');

  // 7. Manual Story Deletion
  console.log('7. Testing manual story deletion and BOLA protection...');
  // Bob tries to delete Alice's story
  const bobDelRes = await post('/stories/delete', { storyId: story2.id }, bobToken);
  console.log('  Bob attempts to delete Alice story (BOLA test):', bobDelRes.status);
  if (bobDelRes.status !== 403) throw new Error('Expected 403 Forbidden when deleting other user story');

  // Alice deletes Story 2
  const aliceDelRes = await post('/stories/delete', { storyId: story2.id }, aliceToken);
  console.log('  Alice deletes Story 2 status:', aliceDelRes.status);

  // Bob checks feed: Story 2 should be gone
  const bobFeedAfterDel = await post('/stories/feed', {}, bobToken);
  const aliceGroup = bobFeedAfterDel.data.data.feed.find((f) => f.author.id === alice.id);
  const deletedStoryFound = aliceGroup?.stories.some((s) => s.id === story2.id);
  if (deletedStoryFound) throw new Error('Deleted story still found in feed!');
  console.log('✓ Story deleted successfully and removed from active feed\n');

  // 8. Disappearing Messages Feature
  console.log('8. Testing Disappearing Messages Lifecycle...');
  // Create direct conversation
  const chatRes = await post('/chats/direct', { participantId: bob.id }, aliceToken);
  const conversation = chatRes.data.data.conversation;
  console.log(`  Direct conversation created: ${conversation.id}`);

  // Alice sets disappearing message duration to 10 seconds
  const disappearRes = await post('/chats/disappearing', {
    conversationId: conversation.id,
    duration: 10, // 10 seconds to comfortably account for Railway latency
  }, aliceToken);

  console.log('  Update disappearing timer status:', disappearRes.status);
  const updatedConv = disappearRes.data.data.conversation;
  if (updatedConv.disappearingDuration !== 10) throw new Error('Expected disappearingDuration to be 10 seconds');
  console.log('✓ Disappearing duration configured to 10 seconds');

  // Alice sends a message in this conversation
  const msgRes = await post('/messages/send', {
    conversationId: conversation.id,
    content: 'This message will self-destruct in 10 seconds',
    type: 'TEXT',
  }, aliceToken);

  console.log('  Message sent status:', msgRes.status);
  const sentMsg = msgRes.data.data.message;
  console.log('  Sent message ID:', sentMsg.id);
  console.log('  Message expiresAt:', sentMsg.expiresAt);
  if (!sentMsg.expiresAt) throw new Error('Message should have expiresAt set');

  const msgLifetime = new Date(sentMsg.expiresAt).getTime() - new Date(sentMsg.createdAt).getTime();
  console.log(`  Message lifetime in ms: ${msgLifetime}ms (~10000ms)`);

  // Query message history immediately: should be visible
  const historyBefore = await post('/messages/list', { conversationId: conversation.id }, bobToken);
  const messagesBefore = Array.isArray(historyBefore.data.data) ? historyBefore.data.data : [];
  const msgInHistory = messagesBefore.find((m) => m.id === sentMsg.id);
  if (!msgInHistory) throw new Error('Message should be visible immediately before expiry');
  console.log('✓ Message is visible in chat history immediately after sending');

  // Wait 11 seconds for message to expire
  console.log('  Waiting 11 seconds for message to expire...');
  await new Promise((r) => setTimeout(r, 11000));

  // Query message history again: should NOT be returned by query filter
  const historyAfter = await post('/messages/list', { conversationId: conversation.id }, bobToken);
  const messagesAfter = Array.isArray(historyAfter.data.data) ? historyAfter.data.data : [];
  const expiredMsgFound = messagesAfter.find((m) => m.id === sentMsg.id);
  if (expiredMsgFound) {
    throw new Error('Expired message was still returned by getMessageHistory query filter!');
  }
  console.log('✓ Expired disappearing message is omitted from message history query');

  bobSocket.disconnect();

  console.log('\n====================================================');
  console.log(' ALL PHASE 11 VERIFICATION TESTS PASSED SUCCESSFULLY! ');
  console.log('====================================================');
  process.exit(0);
};

runTests().catch((err) => {
  console.error('\n❌ PHASE 11 TEST FAILED:', err);
  process.exit(1);
});

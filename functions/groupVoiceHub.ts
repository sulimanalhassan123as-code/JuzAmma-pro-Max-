export default async function(req: Request): Promise<Response> {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  
  try {
    const body = await req.json();
    const action = body.action;
    const roomCode = (body.roomCode || '').toUpperCase();
    const userName = (body.userName || 'Anonymous').substring(0, 30);

    if (!roomCode) return json({ ok: false, error: 'Missing roomCode' }, cors);

    // LIST — return all messages (text + voice) for the room
    if (action === 'list') {
      const records = await base44.entities.GroupVoiceMessage.list({
        filter: { room_code: roomCode },
        sort: 'created_date',
        limit: 100
      });
      const messages = (records || []).map(r => ({
        id: r.id,
        userName: r.user_name || 'Anonymous',
        messageType: r.message_type || 'voice',
        text: r.text || '',
        audioBase64: r.audio_base64 || '',
        durationSec: r.duration_sec || 0,
        created_date: r.created_date
      }));
      return json({ ok: true, messages, total: messages.length }, cors);
    }

    // SEND TEXT
    if (action === 'sendText') {
      const text = (body.text || '').substring(0, 500).trim();
      if (!text) return json({ ok: false, error: 'Empty message' }, cors);
      await base44.entities.GroupVoiceMessage.create({
        room_code: roomCode,
        user_name: userName,
        message_type: 'text',
        text: text,
        audio_base64: '',
        duration_sec: 0
      });
      return json({ ok: true }, cors);
    }

    // SEND VOICE
    if (action === 'send') {
      const audioBase64 = body.audioBase64 || '';
      const durationSec = body.durationSec || 0;
      if (!audioBase64) return json({ ok: false, error: 'No audio data' }, cors);
      await base44.entities.GroupVoiceMessage.create({
        room_code: roomCode,
        user_name: userName,
        message_type: 'voice',
        audio_base64: audioBase64,
        duration_sec: durationSec,
        text: ''
      });
      return json({ ok: true }, cors);
    }

    return json({ ok: false, error: 'Unknown action' }, cors);
  } catch(e) {
    return json({ ok: false, error: String(e) }, cors);
  }
}

function json(data: any, headers: any): Response {
  return new Response(JSON.stringify(data), { headers });
}

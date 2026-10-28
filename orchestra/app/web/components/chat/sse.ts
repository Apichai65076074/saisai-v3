export type ChatEvent = {
  type: 'status' | 'delta' | 'sentence' | 'done' | 'error' | 'tts';
  text?: string;
  seq?: number;
  audioId?: string;
  lang?: string;
  cites?: { filename: string; page: number }[];
  quoteNo?: string;
};

/** Decode across arbitrary UTF-8/chunk boundaries, including CRLF and SSE comments. */
export async function readChatStream(response: Response, receive: (event: ChatEvent) => void) {
  if (!response.body) throw new Error('Empty chat stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const dispatch = (frame: string) => {
    const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (data && data !== '[DONE]') receive(JSON.parse(data) as ChatEvent);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // A trailing CR may be the first byte of CRLF in the next chunk.
      buffer = buffer.replace(/\r\n/g, '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        dispatch(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
      }
      if (done) break;
    }
    if (buffer.trim()) dispatch(buffer);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

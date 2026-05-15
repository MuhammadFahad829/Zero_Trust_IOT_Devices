import { useEffect, useRef } from 'react';

export default function useSocket(url, onMessage) {
  const ws = useRef(null);

  useEffect(() => {
    ws.current = new WebSocket(url);
    ws.current.onopen = () => console.log('ws open');
    ws.current.onmessage = (e) => onMessage && onMessage(e.data);
    ws.current.onclose = () => console.log('ws closed');
    return () => ws.current && ws.current.close();
  }, [url, onMessage]);

  const send = (msg) => ws.current && ws.current.send(msg);
  return { send };
}

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useAppStore } from '../stores/simpleStore';

/** Dictate: type with your voice using the browser's speech recognition (Chrome and Edge). */
const Recognition: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export const useDictation = (editor: Editor | null) => {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => () => recognitionRef.current?.stop(), []);
  // Speech goes to the session it was started in: switching stops listening.
  const sessionId = useAppStore((state) => state.currentSession?.id);
  useEffect(() => {
    recognitionRef.current?.stop();
  }, [sessionId]);

  const toggle = () => {
    if (!editor || !Recognition) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';
    const startedIn = useAppStore.getState().currentSession?.id;
    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      // A result that arrives after a switch, or while the document is loading, is dropped rather than written in.
      if (useAppStore.getState().currentSession?.id !== startedIn || !editor.isEditable) {
        recognition.stop();
        return;
      }
      if (result.isFinal) editor.chain().focus().insertContent(`${result[0].transcript.trim()} `).run();
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return { supported: Boolean(Recognition), listening, toggle };
};

import React, { useEffect } from 'react';
import { useAppStore } from '../stores/simpleStore';
import SimpleEditor from './SimpleEditor';
import AiReviewPanel from './AiReviewPanel';
import InlineAiCard from './InlineAiCard';
import { useSetRecoilState } from 'recoil';
import { documentContentState, isDarkModeState } from '../stores/recoilState';

const MainContent: React.FC = () => {
  const { currentDocument, currentSession, ui } = useAppStore();
  const setDocumentContent = useSetRecoilState(documentContentState);
  const setDarkMode = useSetRecoilState(isDarkModeState);

  useEffect(() => {
    setDarkMode(ui.isDarkMode);
  }, [ui.isDarkMode, setDarkMode]);

  useEffect(() => {
    const content = currentDocument
      ? currentDocument.content || currentDocument.html_content || currentDocument.extracted_text || currentDocument.pages?.[0]?.text_content || ''
      : '';
    setDocumentContent(content);
    // Keyed on the session too: two sessions without documents both have currentDocument null, so the editor
    // used to keep the previous session's text and save it into the new one.
  }, [currentDocument, currentSession?.id, setDocumentContent]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-sunken">
      <AiReviewPanel />
      <div className="min-h-0 flex-1 overflow-hidden">
        <SimpleEditor />
      </div>
      <InlineAiCard />
    </div>
  );
};

export default MainContent;

'use client';

import { useEffect, useState } from 'react';

export type PreviewDocument = {
  id: string;
  title: string;
  kind?: string;
  mimeType?: string | null;
  fileName?: string | null;
  previewUrl?: string | null;
};

function isImage(doc: PreviewDocument) {
  return (doc.mimeType || '').startsWith('image/');
}

function isPdf(doc: PreviewDocument) {
  const name = (doc.fileName || '').toLowerCase();
  return doc.mimeType === 'application/pdf' || name.endsWith('.pdf');
}

export function DocumentPreview({ documents }: { documents: PreviewDocument[] }) {
  const [activeId, setActiveId] = useState<string | null>(documents[0]?.id ?? null);

  useEffect(() => {
    if (!documents.some((doc) => doc.id === activeId)) {
      setActiveId(documents[0]?.id ?? null);
    }
  }, [documents, activeId]);

  if (!documents.length) {
    return <p className="doc-empty">No documents yet</p>;
  }

  const active = documents.find((doc) => doc.id === activeId) || documents[0];
  const kind = active.kind ? active.kind.replace(/_/g, ' ') : 'Document';

  return (
    <div className="doc-preview">
      <ul className="doc-list">
        {documents.map((doc) => (
          <li key={doc.id}>
            <button
              type="button"
              className={doc.id === active.id ? 'on' : ''}
              onClick={() => setActiveId(doc.id)}
            >
              <FileIcon />
              <span>
                <strong>{doc.title}</strong>
                <small>{doc.kind ? doc.kind.replace(/_/g, ' ') : doc.fileName || 'Document'}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <section className="doc-stage">
        <h3>Preview</h3>
        <div className="doc-frame">
          {!active.previewUrl && (
            <p className="muted">Preview is unavailable for {active.title}.</p>
          )}
          {active.previewUrl && isImage(active) && (
            <img src={active.previewUrl} alt={active.title} />
          )}
          {active.previewUrl && isPdf(active) && (
            <iframe title={active.title} src={active.previewUrl} />
          )}
          {active.previewUrl && !isImage(active) && !isPdf(active) && (
            <div className="doc-fallback">
              <FileIcon />
              <p>{active.fileName || active.title}</p>
              <p className="muted">This file type opens in a new tab.</p>
            </div>
          )}
        </div>
        <div className="doc-meta">
          <div>
            <strong>{active.title}</strong>
            <span className="doc-kind">{kind}</span>
            {active.fileName && active.fileName !== active.title && <span className="doc-file">{active.fileName}</span>}
          </div>
          {active.previewUrl && (
            <a className="doc-open" href={active.previewUrl} target="_blank" rel="noreferrer">
              Open
            </a>
          )}
        </div>
      </section>
    </div>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.5h7l4 4V20.5H7zM14 3.5V8h4.5" />
    </svg>
  );
}

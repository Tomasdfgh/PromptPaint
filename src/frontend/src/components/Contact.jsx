export default function Contact({ onClose }) {
  return (
    <div className="about-overlay">
      <div className="about-panel">
        <div className="about-close-wrapper">
          <button className="about-close-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="about-content">
          <h2 className="about-heading">Contact</h2>
          <p>This is the contact page.</p>
        </div>
      </div>
    </div>
  );
}

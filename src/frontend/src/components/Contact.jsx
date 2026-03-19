import { useState } from 'react';

export default function Contact({ onClose }) {
  const [subject,     setSubject]     = useState('');
  const [message,     setMessage]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [success,     setSuccess]     = useState(false);
  const [error,       setError]       = useState(null);

  const wordCount = message.split(/\s+/).filter(w => w.length > 0).length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/contact/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send message.');
      }
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

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
          <div className="about-article">
            <h2 className="about-heading">Contact</h2>

            <p className="about-intro">
              Have a question, found a bug, or just want to say hi? I would love to hear from you.
            </p>

            <section className="about-article-section">
              <h3>About the Team</h3>
              <p>
                This implementation of PromptPaint was built by Thomas Nguyen, an Engineering
                Master's student at the University of Toronto. The project is a personal endeavour to bring the original
                UIST 2023 research to a live, hosted web application accessible to anyone.
              </p>
            </section>

            <section className="about-article-section">
              <h3>Get in Touch</h3>
              <p>
                The best way to reach me is by email. Whether you have feedback on the tool,
                a question about the underlying model, or want to report an issue, feel free
                to reach out directly.
              </p>
              <p className="contact-email">
                tomnguyenvn63@gmail.com
              </p>
            </section>

            <section className="about-article-section">
              <h3>Drop a Message</h3>
              <p>
                You can also leave a message below. Note that this form is not yet connected
                to a backend, so I have no way to reach you back. For direct communication,
                please use the email above.
              </p>
              {success ? (
                <div className="contact-success-message">
                  <p>Message received. Thanks for reaching out!</p>
                </div>
              ) : (
                <form className="contact-form" onSubmit={handleSubmit}>
                  <div className="contact-form-field">
                    <div className="contact-form-field-header">
                      <label htmlFor="contact-subject">Subject</label>
                      <span className="contact-char-count">{subject.length} / 60</span>
                    </div>
                    <input
                      id="contact-subject"
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value.slice(0, 60))}
                      placeholder="What is this about?"
                      maxLength={60}
                      disabled={submitting}
                    />
                  </div>
                  <div className="contact-form-field">
                    <div className="contact-form-field-header">
                      <label htmlFor="contact-message">Message</label>
                      <span className="contact-char-count">{wordCount} words</span>
                    </div>
                    <textarea
                      id="contact-message"
                      value={message}
                      onChange={(e) => {
                        const words = e.target.value.split(/\s+/).filter(w => w.length > 0);
                        if (words.length <= 500 || e.target.value.length < message.length) {
                          setMessage(e.target.value);
                        }
                      }}
                      placeholder="Your message..."
                      rows={6}
                      disabled={submitting}
                    />
                  </div>
                  {error && <p className="contact-error-message">{error}</p>}
                  <button
                    type="submit"
                    className="contact-submit-btn"
                    disabled={submitting || !subject.trim() || !message.trim()}
                  >
                    {submitting ? 'Sending…' : 'Send Message'}
                  </button>
                </form>
              )}
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}

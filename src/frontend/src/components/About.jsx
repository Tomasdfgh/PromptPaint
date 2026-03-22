import { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function KaTeX({ math }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      katex.render(math, ref.current, { throwOnError: false, displayMode: true });
    }
  }, [math]);
  return <span ref={ref} />;
}

export default function About({ onClose }) {
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
            <h2 className="about-heading">About</h2>

            <p className="about-intro">
              PromptPaint is an interactive text-to-image generation tool that lets you steer
              AI art creation through paint-like interactions: blending prompts, redirecting
              generations mid-run, and painting spatial regions with different concepts.
            </p>

            <section className="about-article-section">
              <h3>Original Publication</h3>
              <p>
                This application is an implementation of the research paper by{' '}
                John Joon Young Chung and Eytan Adar from the University of Michigan,
                published at UIST 2023. The paper introduced the concept of using
                paint-medium-like interactions to steer text-to-image diffusion models,
                giving users expressive, intuitive controls that go far beyond typing a
                single prompt.
              </p>
              <p className="about-citation">
                John Joon Young Chung and Eytan Adar. 2023. PromptPaint: Steering Text to Image
                Generation Through Paint Medium-like Interactions. In <em>The 36th Annual ACM
                Symposium on User Interface Software and Technology (UIST&apos;23)</em>,
                October 29–November 1, 2023, San Francisco, CA, USA. ACM, New York, NY, USA,
                17 pages.{' '}
                <a
                  href="https://doi.org/10.1145/3586183.3606777"
                  target="_blank"
                  rel="noreferrer"
                >
                  https://doi.org/10.1145/3586183.3606777
                </a>
              </p>
            </section>

            <section className="about-article-section">
              <h3>Features</h3>
              <p>
                The application implements four generation modes, each corresponding to a
                different way of interacting with the model&apos;s prompt embedding space.
              </p>
              <table className="about-feature-table">
                <thead>
                  <tr>
                    <th>Mode</th>
                    <th>Description</th>
                    <th>Paper</th>
                    <th>My Method</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Mixing</td>
                    <td>
                      Blend N prompts in embedding space. Useful for hybrid concepts no single
                      prompt can express.
                    </td>
                    <td className="about-math">
                      <div className="about-math-label">weighted sum</div>
                      <KaTeX math={`v_{p_m} = \\sum_{i=1}^{N} w_{p_i} v_{p_i}`} />
                    </td>
                    <td className="about-math">
                      <div className="about-math-label">Fréchet mean objective</div>
                      <KaTeX math={`v_{p_m} = \\arg\\min_{v \\in S} \\sum_{i} w_{p_i} \\, d_g(v,\\, v_{p_i})^2`} />
                      <div className="about-math-label">iterative update (log / exp maps)</div>
                      <KaTeX math={`v_{p_m} \\leftarrow \\exp_{v_{p_m}}\\!\\left(\\sum_i w_{p_i} \\log_{v_{p_m}}(v_{p_i})\\right)`} />
                    </td>
                  </tr>
                  <tr>
                    <td>Directional</td>
                    <td>
                      Shift a prompt along a conceptual axis (e.g. matte → glossy).
                      Scale controls intensity and direction.
                    </td>
                    <td className="about-math">
                      <div className="about-math-label">direction vector</div>
                      <KaTeX math={`v_{d_j} = v_{d_{j1}} - v_{d_{j2}}`} />
                      <div className="about-math-label">final embedding</div>
                      <KaTeX math={`v_f = v_{p_m} + \\sum_{j=1}^{M} w_{d_j} v_{d_j}`} />
                    </td>
                    <td className="about-math" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      Same as paper
                    </td>
                  </tr>
                  <tr>
                    <td>Intervention</td>
                    <td>
                      Swap the guiding embedding mid-generation. Early steps set form,
                      late steps set detail. Scrub back to any saved step and resume with
                      a new mix.
                    </td>
                    <td className="about-math">
                      <div className="about-math-label">denoising step</div>
                      <KaTeX math={`x_{t-1} = \\text{denoise}(x_t,\\, t,\\, v_f)`} />
                      <div className="about-math-label">embedding swap at step k</div>
                      <KaTeX math={`v_f \\leftarrow v_f^{\\prime} \\text{ at step } k`} />
                    </td>
                    <td className="about-math" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      Same as paper
                    </td>
                  </tr>
                  <tr>
                    <td>Stencil</td>
                    <td>
                      Paint a mask to assign different prompts to different canvas regions.
                      Overcoat controls how far the result departs from existing content.
                    </td>
                    <td className="about-math">
                      <div className="about-math-label">latent manipulation per step</div>
                      <KaTeX math={`l_{m,k}(x,y) = \\begin{cases} v(l_I(x,y),\\,k) & k < \\left(1 - \\tfrac{o}{100}\\right)K \\\\ l_k(x,y) & k \\geq \\left(1 - \\tfrac{o}{100}\\right)K \\end{cases}`} />
                    </td>
                    <td className="about-math" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      Same as paper
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="about-article-section">
              <h3>Model</h3>
              <p>
                This application runs Stable Diffusion XL (SDXL) Base 1.0 by Stability AI.
                SDXL is a latent diffusion model with a UNet backbone that iteratively denoises
                a random noise tensor over a configurable number of timesteps, guided by text
                embeddings from a dual CLIP text encoder stack (CLIP-L and CLIP-G, concatenated
                to 2048 dimensions). Images are encoded and decoded through a VAE operating in
                a compressed latent space.
              </p>
              <p>
                The model runs in float16 (fp16) precision with the VAE kept in float32 for
                numerical stability. With attention slicing enabled, inference requires
                approximately 7 GB of VRAM. Sampling uses the Euler discrete scheduler.
              </p>
            </section>

            <section className="about-article-section">
              <h3>Hosting</h3>
              <p>
                Both the site and the model are self-hosted on a private server located in
                Toronto, Canada. The stack runs entirely in Docker: a React frontend served
                by Nginx, a Flask backend handling websocket connections via Socket.IO, and
                a FastAPI model service that owns the SDXL pipeline.
              </p>
              <p>
                The model is loaded on dual NVIDIA RTX A4000 GPUs (16 GB VRAM each, 32 GB
                total) and kept resident in memory so there is no cold-start delay between
                requests. Because all generation runs on a single shared GPU, requests are
                serialized through a queue. During high traffic you may need to wait for your
                turn, and if you are connecting from far outside Toronto, expect higher network
                latency when receiving generated images.
              </p>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}

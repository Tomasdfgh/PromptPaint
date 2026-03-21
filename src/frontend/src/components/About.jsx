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
                    <th>Math</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Mixing</td>
                    <td>
                      Blend two or more prompts together in embedding space using normalized
                      interpolation (nlerp). Produces a single coherent embedding that carries
                      the weighted essence of all inputs simultaneously, useful for hybrid
                      concepts no single prompt can capture.
                    </td>
                    <td className="about-math">
                      <KaTeX math={`\\mathbf{v}_m = \\sum_{i=1}^{N} w_i \\mathbf{v}_i`} />
                      <KaTeX math={`\\hat{\\mathbf{v}}_m = \\frac{\\mathbf{v}_m}{\\|\\mathbf{v}_m\\|} \\cdot \\bar{\\|\\mathbf{v}\\|}`} />
                    </td>
                  </tr>
                  <tr>
                    <td>Directional</td>
                    <td>
                      Shift a base prompt along a conceptual axis defined by a From and To concept.
                      The direction vector captures whatever statistically differs between the two
                      concepts in CLIP space. A scale slider controls magnitude and direction.
                    </td>
                    <td className="about-math">
                      <KaTeX math={`\\mathbf{v}_d = \\mathbf{v}_{\\text{to}} - \\mathbf{v}_{\\text{from}}`} />
                      <KaTeX math={`\\mathbf{v}_f = \\mathbf{v}_{\\text{base}} + \\sum_{j=1}^{M} w_j \\mathbf{v}_{d_j}`} />
                    </td>
                  </tr>
                  <tr>
                    <td>Intervention</td>
                    <td>
                      Swap the guiding embedding at any point during the denoising process.
                      Early steps establish overall form and composition; late steps refine
                      detail. Scrub the generation timeline back to any saved step and resume
                      with a new prompt mix to branch the output from that point.
                    </td>
                    <td className="about-math">
                      <KaTeX math={`x_{t-1} = \\text{denoise}(x_t,\\, t,\\, \\mathbf{v}_f)`} />
                      <KaTeX math={`\\mathbf{v}_f \\leftarrow \\mathbf{v}_f^{\\prime} \\text{ at step } k`} />
                    </td>
                  </tr>
                  <tr>
                    <td>Stencil</td>
                    <td>
                      Spatially assign different prompts to different regions of the canvas using
                      brush strokes. Paint a mask over the area you want to control, set a prompt
                      per region, and the model generates a unified image that respects the spatial
                      layout via a custom attention processor applied at each diffusion step.
                    </td>
                    <td className="about-math">
                      <KaTeX math={`l_{m,k}(x,y) = \\begin{cases} v(l_I(x,y),\\,k) & k < \\left(1 - \\tfrac{o}{100}\\right)K \\\\ l_k(x,y) & k \\geq \\left(1 - \\tfrac{o}{100}\\right)K \\end{cases}`} />
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

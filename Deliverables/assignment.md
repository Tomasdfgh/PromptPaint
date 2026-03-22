# Term Project

**60% of final grade | Report due: March 30th (submitted on course website)**

Students will do a substantial project on a research topic to be determined in consultation with the course instructor. The project can be related to any of the papers that are presented, or any other topic related to the areas of AI+HCI. Browsing the recommended research venues listed at the top of this page is a good way to get additional topic ideas.

- Projects should involve the implementation of some form of a prototype. User studies are not required.
- The results of this project will be reported in the form of a **6 page** (including max 1 page references) report to be submitted at the end of the term.
- The report should be in the 2-column format listed on the UIST 2025 website. Please submit a PDF file.
- Please submit any additional files with the report that may help communicate your project. For example, a video of the system/prototype.
- Students will also present the results to the class in an oral presentation and live demonstration (if applicable) at the end of the term. The presentation will be worth half of the term project grade.
- Students should have their topic submitted by Jan 26.

---

## Project Grading

The grading guidelines below are meant to be general guidelines, and you are not expected/required to answer each of these questions in any sort of structured way. If some of these questions do not make sense for your particular project that's fine. In the end, your project will be assessed based on its potential to become a research contribution at the intersection of HCI and AI.

1. What is the specific domain or context that is being addressed and targeted?
2. What is the unique mix of computing technologies that is being used to address the challenge?
3. What types of models did you use for your project, and why?
4. Which papers and themes from this year's class instructed your design decisions? How?
5. What would be the future directions of your project, were it to continue beyond the class?
6. If you were to conduct an evaluation of your system, what would be the first element you would like to test? Why?

---

## Paper: PromptPaint

**Chung & Adar, UIST 2023** — *PromptPaint: Steering Text-to-Image Generation Through Paint Medium-like Interactions*

### Summary

PromptPaint is a web-based image creation tool that combines diffusion-based text-to-image (T2I) generation with interactions inspired by how artists use physical paint mediums (oil paint, watercolor). The core insight is that prompts can be treated like paint colors — mixed, layered, and applied to different parts of a canvas — to give users more iterative, expressive control over AI-generated images.

### Key Interactions

- **Prompt Mixing** — Interpolates multiple prompts in a visual palette (analogous to mixing colors on a palette), allowing users to explore the semantic space *between* discrete text prompts.
- **Directional Prompt** — Shifts the prompt vector along a user-defined direction (e.g., "matte → glossy"), enabling fine-grained attribute control without rewriting prompts.
- **Prompt Stencil** — Users brush a region on the canvas to spatially control where generation occurs, building the image part-by-part (analogous to painting area by area).
- **Prompt Intervention** — Users change the guiding prompt *during* the diffusion generation process; earlier prompts influence overall form, later prompts influence details.

### Technical Approach

Built with HTML/CSS/JavaScript/React and a WebSocket-based Flask backend. Uses **Stable Diffusion** (latent diffusion model) with CLIP as the text encoder and DDIM scheduler. Prompt mixing and directional prompts manipulate the CLIP text embedding vectors; prompt stencil and overcoating manipulate intermediate latent representations during denoising.

### Studies & Findings

- **Characterization study** (crowdsourced, Amazon Mechanical Turk): compared the five approaches (mixing, directional, stencil, intervention, concatenation) for their ability to add new attributes while preserving the original image. Prompt intervention best preserved the original; prompt mixing and directional prompts were most effective at adding new attributes.
- **User study** (N=8, observational/qualitative): participants found the tool enjoyable and expressive. Key tensions identified:
  - *Focused iteration vs. curation of multiple results*
  - *Manual control vs. automation*
  - AI complexity and randomness caused misalignment with user intent
  - Participants felt partial ownership ("collaborated with AI") but varied by expertise level

### Design Takeaways Relevant to the Project

- Paint-medium analogies can make abstract AI vector-space operations tangible and learnable
- In-generation interventions (changing prompts mid-diffusion) are a powerful but under-explored interaction modality
- There is a fundamental trade-off between **control** (manual, high-ceiling) and **exploration** (automated, low-threshold)
- Ownership and attribution of AI-generated artifacts is a significant sociotechnical concern
- Intermediate representations (noisy latents) are hard for users to interpret — making these more readable is a promising future direction

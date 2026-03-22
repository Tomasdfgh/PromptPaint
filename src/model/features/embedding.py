"""
Shared embedding utilities.
All prompt encoding goes through here so the rest of the codebase
never has to touch tokenizers or text encoders directly.
"""

import torch


def encode_prompt(prompt: str, pipeline) -> torch.Tensor:
    """
    Encode a text prompt into CLIP embeddings using the SDXL pipeline's
    two text encoders (CLIP-L and CLIP-G), returning the concatenated
    pooled + sequence embeddings expected by the SDXL UNet.

    Returns:
        prompt_embeds:        [1, 77, 2048]
        pooled_prompt_embeds: [1, 1280]
    """
    tokenizers = [pipeline.tokenizer, pipeline.tokenizer_2]
    text_encoders = [pipeline.text_encoder, pipeline.text_encoder_2]

    prompt_embeds_list = []

    for tokenizer, text_encoder in zip(tokenizers, text_encoders):
        text_inputs = tokenizer(
            prompt,
            padding="max_length",
            max_length=tokenizer.model_max_length,
            truncation=True,
            return_tensors="pt",
        )
        text_input_ids = text_inputs.input_ids.to(text_encoder.device)

        with torch.no_grad():
            output = text_encoder(text_input_ids, output_hidden_states=True)

        # SDXL uses the second-to-last hidden state, not the final layer
        hidden_states = output.hidden_states[-2]
        prompt_embeds_list.append(hidden_states)

    # CLIP-L: [1, 77, 768] | CLIP-G: [1, 77, 1280] → concat → [1, 77, 2048]
    prompt_embeds = torch.cat(prompt_embeds_list, dim=-1)

    # Pooled output comes from CLIP-G only (second encoder)
    pooled_prompt_embeds = output[0]  # [1, 1280]

    return prompt_embeds, pooled_prompt_embeds


def _frechet_mean(tensors: list[torch.Tensor], weights: list[float], n_iter: int = 5) -> torch.Tensor:
    """
    Fréchet mean (Riemannian center of mass) on the hypersphere for N vectors.
    Order-independent. Weights directly correspond to prompt percentages.

    Iterative algorithm (geodesic gradient descent):
      1. Initialize at the nlerp point (good starting estimate).
      2. At each step, compute the log map of every input at the current mean
         (tangent vector pointing toward that input along the geodesic, scaled
         by geodesic distance), take the weighted sum, then step via the exp map.
      3. Renormalize and repeat.

    Applied per-position along dim=-1, so seq embeddings [1, 77, 2048] are
    handled token-by-token and pooled embeddings [1, 1280] as a single vector.
    Preserves the average per-position magnitude of the inputs.
    """
    total = sum(weights)
    w = [wi / total for wi in weights]

    floats = [t.float() for t in tensors]

    # Average magnitude to restore after spherical interpolation
    avg_norm = torch.stack([t.norm(dim=-1, keepdim=True) for t in floats]).mean(0)

    # Normalize inputs onto the unit hypersphere
    F = torch.nn.functional
    units = [F.normalize(t, dim=-1) for t in floats]

    # Initialize: nlerp on unit sphere
    mean = F.normalize(sum(wi * u for wi, u in zip(w, units)), dim=-1)

    for _ in range(n_iter):
        tangent = torch.zeros_like(mean)
        for wi, u in zip(w, units):
            # Cosine similarity clamped for numerical safety
            cos_a = (mean * u).sum(dim=-1, keepdim=True).clamp(-1 + 1e-7, 1 - 1e-7)
            angle = torch.acos(cos_a)                    # geodesic distance
            # Log map: tangent vector at mean pointing toward u
            perp = u - cos_a * mean                      # component of u perpendicular to mean
            perp_norm = perp.norm(dim=-1, keepdim=True).clamp(min=1e-8)
            log = angle * perp / perp_norm
            tangent = tangent + wi * log

        # Exp map: step from mean along the weighted tangent
        t_norm = tangent.norm(dim=-1, keepdim=True).clamp(min=1e-8)
        mean = torch.cos(t_norm) * mean + torch.sin(t_norm) * tangent / t_norm
        mean = F.normalize(mean, dim=-1)

    return (mean * avg_norm).to(tensors[0].dtype)


def mix_embeddings(
    embeddings: list[tuple[torch.Tensor, torch.Tensor]],
    weights: list[float],
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Mix N encoded prompts using the Fréchet mean on the hypersphere.
    Weights directly correspond to prompt percentages — order-independent.

    Args:
        embeddings: list of (seq_emb, pooled_emb) tuples from encode_prompt
        weights:    per-prompt weights (any positive values, will be normalized)
    """
    seqs    = [e[0] for e in embeddings]
    pooleds = [e[1] for e in embeddings]
    return _frechet_mean(seqs, weights), _frechet_mean(pooleds, weights)


def directional_embedding(
    base: tuple[torch.Tensor, torch.Tensor],
    from_concept: tuple[torch.Tensor, torch.Tensor],
    to_concept: tuple[torch.Tensor, torch.Tensor],
    scale: float = 1.0,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Shift base embedding along a direction defined by (to_concept - from_concept).
    e.g. base="sphere", from="matte", to="glossy"
         → sphere shifted toward glossy

    Args:
        base:         embedding to shift
        from_concept: starting point of the direction vector
        to_concept:   ending point of the direction vector
        scale:        how far to move along the direction (1.0 = full step)
    """
    seq_base,   pooled_base   = base
    seq_from,   pooled_from   = from_concept
    seq_to,     pooled_to     = to_concept

    seq_result    = seq_base    + scale * (seq_to    - seq_from)
    pooled_result = pooled_base + scale * (pooled_to - pooled_from)

    return seq_result, pooled_result

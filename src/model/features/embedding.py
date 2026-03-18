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


def _nlerp(tensors: list[torch.Tensor], weights: list[float]) -> torch.Tensor:
    """
    Normalized lerp for N vectors — weighted sum projected back onto the
    hypersphere. Order-independent and generalizes to any number of inputs.

    For seq embeddings [1, 77, 2048]: normalizes each token vector independently.
    For pooled embeddings [1, 1280]: normalizes the single vector.
    Preserves the average per-position magnitude of the inputs.
    """
    total = sum(weights)
    weights = [w / total for w in weights]

    # Weighted sum
    mixed = sum(w * t.float() for w, t in zip(weights, tensors))

    # Average per-position norm across input tensors (keepdim for broadcasting)
    # dim=-1 means per-token for seq, per-vector for pooled
    avg_norm = torch.stack([t.float().norm(dim=-1, keepdim=True) for t in tensors]).mean(0)

    # Normalize each position to unit length, then scale by average input norm
    mixed = torch.nn.functional.normalize(mixed, dim=-1) * avg_norm

    return mixed.to(tensors[0].dtype)


def mix_embeddings(
    embeddings: list[tuple[torch.Tensor, torch.Tensor]],
    weights: list[float],
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Mix N encoded prompts using normalized lerp (nlerp).
    Works for 2 or more prompts. Weights are automatically normalized to sum to 1.

    Args:
        embeddings: list of (seq_emb, pooled_emb) tuples from encode_prompt
        weights:    per-prompt weights (any positive values, will be normalized)
    """
    seqs    = [e[0] for e in embeddings]
    pooleds = [e[1] for e in embeddings]
    return _nlerp(seqs, weights), _nlerp(pooleds, weights)


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

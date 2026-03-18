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


def mix_embeddings(
    emb_a: tuple[torch.Tensor, torch.Tensor],
    emb_b: tuple[torch.Tensor, torch.Tensor],
    alpha: float,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Linearly interpolate between two encoded prompts.
    alpha=0.0 → fully emb_a, alpha=1.0 → fully emb_b.

    Args:
        emb_a: (prompt_embeds, pooled_prompt_embeds) from encode_prompt
        emb_b: (prompt_embeds, pooled_prompt_embeds) from encode_prompt
        alpha: interpolation weight in [0, 1]
    """
    seq_a, pooled_a = emb_a
    seq_b, pooled_b = emb_b

    seq_mixed    = (1 - alpha) * seq_a    + alpha * seq_b
    pooled_mixed = (1 - alpha) * pooled_a + alpha * pooled_b

    return seq_mixed, pooled_mixed


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

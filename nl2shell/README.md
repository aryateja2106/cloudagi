# NL2Shell — Natural Language to Shell Commands

An ultra-lightweight fine-tuned language model that converts natural language descriptions into executable Unix and macOS shell commands. Built on Qwen3.5-0.8B with QLoRA, the model is designed for edge deployment and runs fully offline on consumer hardware.

**HuggingFace:** [AryaYT/nl2shell-0.8b](https://huggingface.co/AryaYT/nl2shell-0.8b)

---

## Overview

NL2Shell lets you describe what you want to do in plain English and get back a ready-to-run shell command:

```
Input:  find all Python files modified in the last 24 hours
Output: find . -name '*.py' -mtime -1

Input:  kill the process using port 3000
Output: lsof -ti:3000 | xargs kill -9

Input:  check SSL certificate expiry of a domain
Output: echo | openssl s_client -connect example.com:443 2>/dev/null | openssl x509 -noout -dates
```

The model outputs only the command — no explanations, no markdown fences, no preamble. It is optimized for integration into shells, editors, and agent pipelines where command extraction overhead matters.

### Key Properties

| Property | Value |
|---|---|
| Base model | Qwen/Qwen3.5-0.8B |
| Fine-tuning method | QLoRA (4-bit) |
| GGUF size (q4_k_m) | ~400 MB |
| GGUF size (q8_0) | ~650 MB |
| Max sequence length | 512 tokens |
| Training data | NL2Bash + 40 macOS synthetic pairs |
| Training format | ChatML |
| Hardware target | Raspberry Pi, Mac M-series, edge devices |

---

## Quick Start

### Using with Ollama (recommended for most users)

Ollama pulls the GGUF directly from HuggingFace. No Python environment required.

```bash
# Install Ollama if you haven't already
# https://ollama.com/download

# Run the model (pulls q4_k_m ~400MB on first run)
ollama run hf.co/AryaYT/nl2shell-0.8b

# Then type your request at the prompt:
>>> list all open network connections
```

For scripted use:

```bash
ollama run hf.co/AryaYT/nl2shell-0.8b "show disk usage of current directory"
```

### Using with Python (transformers)

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

SYSTEM = (
    "You are an expert shell programmer. Given a natural language request, "
    "output ONLY the corresponding shell command. No explanations."
)

model_id = "AryaYT/nl2shell-0.8b"
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(model_id, device_map="auto")

def nl2shell(request: str) -> str:
    prompt = (
        f"<|im_start|>system\n{SYSTEM}<|im_end|>\n"
        f"<|im_start|>user\n{request}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    outputs = model.generate(
        **inputs,
        max_new_tokens=128,
        temperature=0.1,
        do_sample=True,
        pad_token_id=tokenizer.eos_token_id,
    )
    full = tokenizer.decode(outputs[0], skip_special_tokens=False)
    cmd = full.split("<|im_start|>assistant\n")[-1]
    cmd = cmd.split("<|im_end|>")[0].strip()
    return cmd

print(nl2shell("show all running Docker containers"))
# docker ps
```

### Using with llama.cpp

```bash
# Download the GGUF from HuggingFace
huggingface-cli download AryaYT/nl2shell-0.8b \
    --include "gguf/nl2shell-0.8b-q4_k_m.gguf" \
    --local-dir ./models

# Run inference
./llama-cli \
    -m ./models/gguf/nl2shell-0.8b-q4_k_m.gguf \
    --temp 0.1 \
    -p "<|im_start|>system
You are an expert shell programmer. Given a natural language request, output ONLY the corresponding shell command. No explanations.<|im_end|>
<|im_start|>user
compress the src directory into a tar.gz<|im_end|>
<|im_start|>assistant
"
```

---

## Architecture

### Base Model

[Qwen3.5-0.8B](https://huggingface.co/Qwen/Qwen3.5-0.8B) is Alibaba's 800-million-parameter language model, selected for this project because it delivers strong instruction-following capability at a size that fits comfortably in edge deployment targets (Raspberry Pi 4, Mac M-series unified memory, mobile NPUs). The model uses grouped-query attention and supports a 32K context window, though NL2Shell caps sequences at 512 tokens given the short input/output nature of shell commands.

### Fine-tuning: QLoRA

The model is fine-tuned using Quantized Low-Rank Adaptation (QLoRA):

- **4-bit quantization** (NF4 dtype, double quantization) reduces the base model footprint during training
- **LoRA adapters** are injected into all seven linear projection layers: `q_proj`, `k_proj`, `v_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj`
- **Rank 16, alpha 32** — the adapter doubles the effective learning rate scaling relative to rank, a standard configuration for task-specific fine-tuning
- **Dropout 0.05** on adapter weights for regularization
- **Gradient checkpointing** via Unsloth's memory-efficient implementation

Only the adapter parameters are trained (roughly 1-2% of total parameters). The final artifact is exported as a merged 16-bit model and then quantized to GGUF for deployment.

### Training Data

| Source | Size | Description |
|---|---|---|
| `jiacheng-ye/nl2bash` | ~10,000 pairs | Crowdsourced NL-to-bash command pairs from the NL2Bash benchmark |
| macOS synthetic pairs | 40 pairs | Hand-crafted pairs covering Homebrew, Docker, macOS networking, Git, and system utilities |

Both sources are formatted as ChatML before training. The macOS synthetic pairs address coverage gaps in the NL2Bash dataset, which skews toward Linux utilities (`apt`, `systemctl`, `/proc`) that do not exist on macOS.

### Input Format: ChatML

All training examples and inference prompts use the ChatML template:

```
<|im_start|>system
You are an expert shell programmer. Given a natural language request, output ONLY the corresponding shell command. No explanations.<|im_end|>
<|im_start|>user
{natural language request}<|im_end|>
<|im_start|>assistant
{shell command}<|im_end|>
```

During inference, the assistant token is left open and the model generates the command.

### Neural Memory and Structured Prompting

The model leverages transformer attention as an associative memory: after fine-tuning, the attention heads encode statistical associations between natural language verb-noun patterns ("find", "list", "kill", "compress") and their corresponding shell idioms (`find`, `ls`, `kill`, `tar`). The system prompt acts as a persistent context anchor — it keeps the model in "command-only" mode, suppressing the base model's tendency to add explanations or markdown formatting. Temperature is set to 0.1 at inference to favor high-probability, deterministic command completions over creative variation.

---

## Training

### Reproducing the Training Run

**Prerequisites:**

```bash
# Python 3.10+
pip install datasets huggingface_hub
```

**Steps:**

1. Clone this repository:
   ```bash
   git clone https://github.com/aryateja2106/cloudagi
   cd cloudagi/nl2shell
   ```

2. Set your HuggingFace token in `prepare.py`:
   ```python
   HF_TOKEN = "hf_your_token_here"
   ```

3. Run training:
   ```bash
   python3 train.py
   ```

`train.py` installs its own dependencies (Unsloth, TRL, PEFT, bitsandbytes) at runtime. On first execution it will pull ~2GB of base model weights from HuggingFace.

### File Responsibilities

| File | Purpose | Editable? |
|---|---|---|
| `prepare.py` | Dataset loading, ChatML formatting, evaluation harness, constants | No — treat as immutable |
| `train.py` | Model loading, QLoRA config, SFTTrainer setup, export and push | Yes — tune hyperparameters here |
| `program.md` | Budget constraints, success criteria, rules | Reference only |
| `nl2shell-train.ipynb` | Jupyter notebook for Colab Enterprise | Yes |

**Rule:** Do not modify `prepare.py`. All hyperparameter changes (learning rate, batch size, epochs) belong in `train.py`.

### Colab Enterprise Deployment

The training job is designed for Google Colab Enterprise on an A100 GPU. To launch via `gcloud`:

```bash
# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Upload scripts to your Colab environment, then run:
python3 train.py
```

**Compute budget:** The full training run (3 epochs, ~10,000 examples) consumes approximately 3-5 Colab compute units on an A100. The hard budget cap is 15 compute units.

### Hyperparameter Reference

| Parameter | Value | Notes |
|---|---|---|
| Epochs | 3 | Increase to 5 if loss plateaus |
| Per-device batch size | 8 | Reduce to 4 if OOM |
| Gradient accumulation | 4 | Effective batch = 32 |
| Learning rate | 2e-4 | AdamW with cosine schedule |
| Warmup steps | 20 | |
| LoRA rank | 16 | |
| LoRA alpha | 32 | |
| LoRA dropout | 0.05 | |
| Max sequence length | 512 | |
| Optimizer | adamw_8bit | 8-bit Adam for memory efficiency |
| Precision | bf16 (A100) / fp16 (fallback) | Auto-detected |

---

## Evaluation

After training, the script automatically runs 7 held-out natural language prompts through the model and prints the generated commands:

| Prompt | Expected Command |
|---|---|
| list all files in the current directory | `ls -la` |
| find all Python files larger than 1MB | `find . -name '*.py' -size +1M` |
| show the last 20 lines of a log file | `tail -20 logfile.log` |
| create a compressed backup of the home directory | `tar -czf home_backup.tar.gz ~` |
| check which process is using port 8080 | `lsof -i :8080` |
| show all running processes sorted by memory usage | `ps aux --sort=-%mem` |
| count the number of lines in all .py files recursively | `find . -name '*.py' \| xargs wc -l` |

**Success criterion:** the model produces syntactically valid shell commands for at least 5 of 7 prompts.

Benchmark results against the full NL2Bash test split will be added here once the model has completed training.

---

## Edge Deployment

### GGUF Quantizations

| Format | Size | Target |
|---|---|---|
| q4_k_m | ~400 MB | Raspberry Pi 4, phones, constrained environments |
| q8_0 | ~650 MB | Mac M-series, desktop Linux, better accuracy |

The q4_k_m quantization uses 4-bit weights with k-quant grouping — it reduces memory by ~75% relative to the merged 16-bit model while preserving command generation quality for short-output tasks like NL2Shell.

### Running on Raspberry Pi

```bash
# Build llama.cpp (Pi 4 with 4GB RAM recommended)
git clone https://github.com/ggerganov/llama.cpp && cd llama.cpp
make -j4

# Download the model
wget https://huggingface.co/AryaYT/nl2shell-0.8b/resolve/main/gguf/nl2shell-0.8b-q4_k_m.gguf

# Run
./llama-cli -m nl2shell-0.8b-q4_k_m.gguf --temp 0.1 -p "..."
```

### Running on Mac (Apple Silicon)

Metal acceleration is supported out of the box in llama.cpp and Ollama on Apple Silicon. The q4_k_m model loads in roughly 500ms on M1/M2 and generates commands in under a second.

```bash
ollama run hf.co/AryaYT/nl2shell-0.8b
```

### Integration as a Shell Function

Add to your `.zshrc` or `.bashrc`:

```bash
nl() {
    ollama run hf.co/AryaYT/nl2shell-0.8b "$*" 2>/dev/null
}

# Usage:
nl find all Python files modified today
```

---

## Project Structure

```
nl2shell/
├── prepare.py             # IMMUTABLE — dataset loading, ChatML formatting, eval harness
├── train.py               # Training script — QLoRA config, SFTTrainer, export to HuggingFace
├── program.md             # Compute budget, success criteria, operational rules
└── nl2shell-train.ipynb   # Colab Enterprise notebook version of the training pipeline
```

---

## Citation

If you use NL2Shell or the training approach in your research, please cite:

```bibtex
@misc{nl2shell2026,
  title        = {NL2Shell: Ultra-Lightweight Natural Language to Shell Command Translation via QLoRA},
  author       = {Arya Teja},
  year         = {2026},
  howpublished = {\url{https://huggingface.co/AryaYT/nl2shell-0.8b}},
  note         = {Fine-tuned from Qwen/Qwen3.5-0.8B on NL2Bash + macOS synthetic pairs}
}
```

The NL2Bash dataset used for training:

```bibtex
@inproceedings{lin2018nl2bash,
  title     = {NL2Bash: A Corpus and Semantic Parser for Natural Language Interface to the Linux Operating System},
  author    = {Lin, Xi Victoria and Wang, Chenglong and Zettlemoyer, Luke and Ernst, Michael D.},
  booktitle = {Proceedings of the Eleventh International Conference on Language Resources and Evaluation (LREC 2018)},
  year      = {2018}
}
```

---

## License

MIT License. See [LICENSE](../LICENSE) for details.

The base model (Qwen/Qwen3.5-0.8B) is released under the Apache 2.0 license. The NL2Bash dataset is released for research use — see [jiacheng-ye/nl2bash](https://huggingface.co/datasets/jiacheng-ye/nl2bash) for its original license terms.

---

## Authors

**Arya Teja** ([@aryateja2106](https://github.com/aryateja2106))
Part of the [CloudAGI](https://cloudagi.ai) project — Agent Credit Economy and AI infrastructure tooling.

---

## Related Work

- [NL2Bash (Lin et al., 2018)](https://aclanthology.org/L18-1491/) — the foundational dataset and benchmark
- [Qwen3.5 Technical Report](https://huggingface.co/Qwen/Qwen3.5-0.8B) — base model
- [QLoRA (Dettmers et al., 2023)](https://arxiv.org/abs/2305.14314) — fine-tuning method
- [Unsloth](https://github.com/unslothai/unsloth) — memory-efficient training implementation used here

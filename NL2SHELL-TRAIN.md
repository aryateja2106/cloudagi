# NL2Shell Overnight Training — Agent Orchestration Prompt

Paste this entire prompt into your CloudAGI Claude Code session (the one with HF skills installed).

---

## PROMPT START — COPY BELOW THIS LINE

You are orchestrating an overnight model training run for NL2Shell — a natural language to shell command model. You have access to HuggingFace skills (model-trainer, evaluation, trackio, tool-builder, datasets) and `lecoder-cgpu` CLI for Google Colab Pro.

### GOAL
Train Qwen3-0.6B on NL2Bash using QLoRA via Unsloth on a Colab A100, export GGUF, push to HuggingFace as `AryaYT/nl2shell-0.6b`. All orchestrated from this terminal — no browser needed.

### ARCHITECTURE (Karpathy autoresearch pattern)
Create three files locally, then deploy to Colab:

```
nl2shell/
├── prepare.py   # IMMUTABLE: dataset download, tokenizer, eval utils
├── train.py     # AGENT-EDITABLE: model, QLoRA config, training loop
└── program.md   # HUMAN-EDITABLE: instructions and constraints
```

### PHASE 1: Setup & Connect (do this first)

1. Create a local directory: `mkdir -p nl2shell && cd nl2shell`

2. Create `prepare.py` — dataset loading and eval:
   - Load `jiacheng-ye/nl2bash` from HuggingFace (8090 train, 609 val, 606 test)
   - Add 30+ macOS-specific synthetic NL→shell pairs (brew, launchctl, lsof, etc.)
   - Format as ChatML: `<|im_start|>system\n...<|im_end|>\n<|im_start|>user\n{nl}<|im_end|>\n<|im_start|>assistant\n{bash}<|im_end|>`
   - System prompt: "You are an expert shell programmer. Given a natural language description, output the exact shell command. Output only the command, no explanation."
   - Eval function: takes model + tokenizer, runs 10 test prompts, prints NL→CMD pairs

3. Create `train.py` — the training script:
   - Use Unsloth `FastLanguageModel` with `unsloth/Qwen3-0.6B-bnb-4bit`
   - QLoRA: rank=16, alpha=32, all linear layers, dropout=0.05
   - SFTTrainer with packing=True, 3 epochs, batch=8, grad_accum=4, lr=2e-4, cosine schedule
   - Save checkpoints every 100 steps to `/content/drive/MyDrive/nl2shell-checkpoints`
   - After training: run eval, export GGUF (q4_k_m + q8_0), push to HuggingFace `AryaYT/nl2shell-0.6b`
   - Upload model card with MIT license, tags, usage instructions
   - Print "TRAINING_COMPLETE" as the final line so we can detect completion

4. Create `program.md` — constraints:
   - Budget: 300 Colab Pro compute units, target <15 CU for this run
   - Metric: eval_loss (lower is better)
   - CRITICAL: Close the Colab session when training is done to stop billing
   - HF username: AryaYT, repo: nl2shell-0.6b

### PHASE 2: Deploy to Colab via lecoder-cgpu

Run these commands in sequence:

```bash
# 1. Check no sessions are running (avoid waste!)
lecoder-cgpu sessions list

# 2. Authenticate (should already be cached)
lecoder-cgpu status

# 3. Connect to A100 runtime
lecoder-cgpu connect --gpu a100 --high-ram

# 4. Install dependencies on Colab
lecoder-cgpu run "pip install --upgrade --force-reinstall --no-cache-dir unsloth unsloth_zoo && pip install -q datasets trl peft accelerate bitsandbytes transformers huggingface_hub"

# 5. Copy training files to Colab
lecoder-cgpu copy nl2shell/prepare.py /content/prepare.py
lecoder-cgpu copy nl2shell/train.py /content/train.py

# 6. Mount Google Drive on Colab (for checkpoint persistence)
lecoder-cgpu run "python3 -c \"from google.colab import drive; drive.mount('/content/drive')\""

# 7. Set HF token on Colab
lecoder-cgpu run "python3 -c \"from huggingface_hub import login; login(token='$(cat ~/.cache/huggingface/token)')\""

# 8. Run prepare.py (download dataset, verify)
lecoder-cgpu run "cd /content && python3 prepare.py"

# 9. START TRAINING (this is the long-running step)
lecoder-cgpu run "cd /content && python3 train.py" --timeout 7200
```

### PHASE 3: Monitor & Cleanup

After training completes (or use a separate agent to poll):

```bash
# Check if training is done
lecoder-cgpu run "cat /content/training_status.txt 2>/dev/null || echo 'STILL_RUNNING'"

# Verify model on HuggingFace
hf models info AryaYT/nl2shell-0.6b

# CRITICAL: Close the session to stop billing
lecoder-cgpu sessions list
lecoder-cgpu sessions close <session-id>

# Verify no sessions remain
lecoder-cgpu sessions list
```

### PHASE 4: Test Locally

```bash
# Pull GGUF from HuggingFace
hf download AryaYT/nl2shell-0.6b --include "gguf/*" --local-dir ./nl2shell-gguf

# Test with Ollama (if installed)
# ollama run hf.co/AryaYT/nl2shell-0.6b
```

### CONSTRAINTS
- Do NOT leave Colab sessions running idle. Always close when done.
- Do NOT use more than 15 compute units on this run.
- All training must be orchestrated via `lecoder-cgpu` commands — no browser.
- Use the HuggingFace skills (model-trainer, evaluation, datasets, trackio) when relevant.
- If `lecoder-cgpu run` times out on the training step, that's OK — training continues on Colab. Poll with `lecoder-cgpu run "cat /content/training_status.txt"` until you see TRAINING_COMPLETE.
- After TRAINING_COMPLETE, verify the model exists on HuggingFace, then close the session.

### AGENT TEAM STRATEGY
If you want to parallelize:
- **Agent 1 (Builder):** Creates prepare.py and train.py with best practices
- **Agent 2 (Deployer):** Handles lecoder-cgpu connection, file copy, training execution
- **Agent 3 (Monitor):** Polls training status, handles cleanup and session close
- **Agent 4 (Evaluator):** After training, pulls model, runs local eval, writes report

### SUCCESS CRITERIA
- [ ] Model `AryaYT/nl2shell-0.6b` exists on HuggingFace with model card
- [ ] GGUF files (q4_k_m, q8_0) uploaded to the repo
- [ ] Colab session closed (zero active sessions)
- [ ] Compute units used: <15
- [ ] Eval results printed showing reasonable NL→shell translations

## PROMPT END

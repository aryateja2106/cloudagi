#!/usr/bin/env python3
"""
NL2Shell — Overnight Fine-tuning Pipeline
==========================================
Fine-tunes Qwen3-0.6B on NL2Bash + NL2CMD for natural language to shell command translation.
Designed for Google Colab Pro A100. Exports GGUF and pushes to HuggingFace.

Usage on Colab:
  1. Set runtime to A100 GPU + High RAM
  2. Run all cells
  3. Close laptop — training continues (Colab Pro)
  4. Model appears on HuggingFace: AryaYT/nl2shell-0.6b

Estimated: ~1.5 hours training, ~5 compute units on A100
"""

# ==============================================================================
# Cell 1: Install Dependencies
# ==============================================================================

# !pip install -q "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
# !pip install -q --no-deps trl peft accelerate bitsandbytes
# !pip install -q datasets huggingface_hub llama-cpp-python

import os
os.environ["WANDB_DISABLED"] = "true"  # No wandb needed

# ==============================================================================
# Cell 2: Login to HuggingFace
# ==============================================================================

from huggingface_hub import login
# Paste your HF token here or use env var
HF_TOKEN = os.environ.get("HF_TOKEN", "YOUR_TOKEN_HERE")
login(token=HF_TOKEN)

MODEL_NAME = "Qwen/Qwen3-0.6B"
OUTPUT_REPO = "AryaYT/nl2shell-0.6b"
MAX_SEQ_LENGTH = 512
LORA_RANK = 32

# ==============================================================================
# Cell 3: Load Model with Unsloth (4-bit QLoRA)
# ==============================================================================

from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=MODEL_NAME,
    max_seq_length=MAX_SEQ_LENGTH,
    dtype=None,  # auto-detect
    load_in_4bit=True,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=LORA_RANK,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    lora_alpha=LORA_RANK,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=42,
)

# ==============================================================================
# Cell 4: Prepare Dataset — NL2Bash + Synthetic Shell Commands
# ==============================================================================

from datasets import load_dataset, concatenate_datasets, Dataset

PROMPT_TEMPLATE = """Convert this natural language request into a shell command.

### Request:
{input}

### Shell Command:
{output}"""

def format_nl2bash(examples):
    """Format NL2Bash dataset entries."""
    texts = []
    for nl, cmd in zip(examples["nl"], examples["bash"]):
        text = PROMPT_TEMPLATE.format(input=nl.strip(), output=cmd.strip())
        texts.append(text + tokenizer.eos_token)
    return {"text": texts}

# Load NL2Bash from HuggingFace
print("Loading NL2Bash dataset...")
try:
    nl2bash = load_dataset("AnonymousSub/NL2Bash", split="train")
    nl2bash = nl2bash.map(format_nl2bash, batched=True, remove_columns=nl2bash.column_names)
    print(f"  NL2Bash: {len(nl2bash)} examples")
except Exception as e:
    print(f"  NL2Bash load failed: {e}, trying alternative...")
    nl2bash = load_dataset("aelhalili/bash-commands-dataset", split="train")
    def format_alt(examples):
        texts = []
        for prompt, response in zip(examples["prompt"], examples["response"]):
            text = PROMPT_TEMPLATE.format(input=prompt.strip(), output=response.strip())
            texts.append(text + tokenizer.eos_token)
        return {"text": texts}
    nl2bash = nl2bash.map(format_alt, batched=True, remove_columns=nl2bash.column_names)
    print(f"  Alternative bash dataset: {len(nl2bash)} examples")

# Add macOS-specific synthetic data
macos_pairs = [
    ("list all installed homebrew packages", "brew list"),
    ("update homebrew and upgrade all packages", "brew update && brew upgrade"),
    ("show disk usage of current directory", "du -sh ."),
    ("find all Python files modified in the last 24 hours", "find . -name '*.py' -mtime -1"),
    ("show all running Docker containers", "docker ps"),
    ("kill the process using port 3000", "lsof -ti:3000 | xargs kill -9"),
    ("create a new git branch called feature-auth", "git checkout -b feature-auth"),
    ("show git log as one-line summaries", "git log --oneline -20"),
    ("compress the src directory into a tar.gz", "tar -czf src.tar.gz src/"),
    ("show system memory usage", "vm_stat | head -10"),
    ("list all open network connections", "lsof -i -P -n | head -20"),
    ("recursively find files larger than 100MB", "find / -size +100M -type f 2>/dev/null"),
    ("show the last 50 lines of the system log", "tail -50 /var/log/system.log"),
    ("restart the DNS cache on macOS", "sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder"),
    ("show all environment variables containing PATH", "env | grep PATH"),
    ("count lines of code in all TypeScript files", "find . -name '*.ts' | xargs wc -l"),
    ("check if port 8080 is in use", "lsof -i :8080"),
    ("show the top 10 largest files in current directory", "ls -lhS | head -10"),
    ("create an SSH tunnel from local 8080 to remote 80", "ssh -L 8080:localhost:80 user@host"),
    ("watch a directory for file changes", "fswatch -r . | head -20"),
    ("install a package globally with npm", "npm install -g package-name"),
    ("run a Python HTTP server on port 8000", "python3 -m http.server 8000"),
    ("show all cron jobs for current user", "crontab -l"),
    ("check SSL certificate expiry of a domain", "echo | openssl s_client -connect example.com:443 2>/dev/null | openssl x509 -noout -dates"),
    ("search for a string recursively in all files", "grep -r 'search_string' ."),
    ("show CPU and memory usage of all processes", "top -l 1 | head -20"),
    ("generate a random 32-character password", "openssl rand -base64 32"),
    ("download a file with curl and save it", "curl -LO https://example.com/file.tar.gz"),
    ("show the size of each subdirectory", "du -sh */ | sort -rh"),
    ("list all git branches sorted by last commit date", "git branch --sort=-committerdate"),
    ("set a file as executable", "chmod +x script.sh"),
    ("show the difference between two files", "diff file1.txt file2.txt"),
    ("find and delete all node_modules directories", "find . -name 'node_modules' -type d -prune -exec rm -rf {} +"),
    ("show which process is using the most CPU", "ps aux --sort=-%cpu | head -5"),
    ("create a symbolic link", "ln -s /path/to/original /path/to/link"),
    ("watch the output of a command every 2 seconds", "watch -n 2 'command'"),
    ("show all listening TCP ports", "netstat -tlnp 2>/dev/null || ss -tlnp"),
    ("convert a video to mp4 using ffmpeg", "ffmpeg -i input.mov -c:v libx264 -c:a aac output.mp4"),
    ("show git stash list", "git stash list"),
    ("run a command in the background and disown it", "nohup command &>/dev/null & disown"),
]

macos_data = Dataset.from_dict({
    "text": [
        PROMPT_TEMPLATE.format(input=nl, output=cmd) + tokenizer.eos_token
        for nl, cmd in macos_pairs
    ]
})

# Combine datasets
dataset = concatenate_datasets([nl2bash, macos_data])
dataset = dataset.shuffle(seed=42)
print(f"\nTotal training examples: {len(dataset)}")

# ==============================================================================
# Cell 5: Train with QLoRA
# ==============================================================================

from trl import SFTTrainer
from transformers import TrainingArguments
import math

num_epochs = 3
batch_size = 8
grad_accum = 4
steps_per_epoch = math.ceil(len(dataset) / (batch_size * grad_accum))
total_steps = steps_per_epoch * num_epochs
save_steps = max(steps_per_epoch // 2, 50)

print(f"Training config:")
print(f"  Examples: {len(dataset)}")
print(f"  Epochs: {num_epochs}")
print(f"  Batch size: {batch_size} x {grad_accum} grad_accum = {batch_size * grad_accum} effective")
print(f"  Steps/epoch: {steps_per_epoch}")
print(f"  Total steps: {total_steps}")
print(f"  Save every: {save_steps} steps")

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=MAX_SEQ_LENGTH,
    dataset_num_proc=2,
    packing=True,
    args=TrainingArguments(
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=grad_accum,
        warmup_steps=20,
        num_train_epochs=num_epochs,
        learning_rate=2e-4,
        fp16=not __import__('torch').cuda.is_bf16_supported(),
        bf16=__import__('torch').cuda.is_bf16_supported(),
        logging_steps=10,
        save_steps=save_steps,
        save_total_limit=2,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="cosine",
        seed=42,
        output_dir="nl2shell-checkpoints",
        report_to="none",
    ),
)

print("\n🚀 Starting training...")
trainer_stats = trainer.train()
print(f"\n✅ Training complete!")
print(f"  Training loss: {trainer_stats.training_loss:.4f}")
print(f"  Training time: {trainer_stats.metrics['train_runtime']:.0f}s")

# ==============================================================================
# Cell 6: Quick Evaluation
# ==============================================================================

FastLanguageModel.for_inference(model)

test_prompts = [
    "list all files in the current directory",
    "find all Python files larger than 1MB",
    "show the last 20 lines of a log file",
    "create a compressed backup of the home directory",
    "check which process is using port 8080",
]

print("\n📊 Quick evaluation:")
print("=" * 60)
for prompt in test_prompts:
    inputs = tokenizer(
        PROMPT_TEMPLATE.format(input=prompt, output=""),
        return_tensors="pt"
    ).to("cuda")

    outputs = model.generate(
        **inputs,
        max_new_tokens=64,
        temperature=0.1,
        do_sample=True,
    )

    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    # Extract just the shell command part
    if "### Shell Command:" in response:
        cmd = response.split("### Shell Command:")[-1].strip()
    else:
        cmd = response[len(tokenizer.decode(inputs["input_ids"][0], skip_special_tokens=True)):].strip()

    print(f"  NL: {prompt}")
    print(f"  SH: {cmd}")
    print()

# ==============================================================================
# Cell 7: Save & Export to GGUF
# ==============================================================================

# Save LoRA adapter
print("💾 Saving LoRA adapter...")
model.save_pretrained("nl2shell-lora")
tokenizer.save_pretrained("nl2shell-lora")

# Merge LoRA into base model and save as 16-bit
print("🔀 Merging LoRA into base model...")
model.save_pretrained_merged("nl2shell-merged", tokenizer, save_method="merged_16bit")

# Export GGUF quantizations
print("📦 Exporting GGUF (Q4_K_M for RPi, Q8_0 for Mac)...")
try:
    model.save_pretrained_gguf(
        "nl2shell-gguf-q4",
        tokenizer,
        quantization_method="q4_k_m",  # ~400MB, good for RPi
    )
    print("  ✅ Q4_K_M exported")
except Exception as e:
    print(f"  ⚠️ Q4 export failed: {e}")

try:
    model.save_pretrained_gguf(
        "nl2shell-gguf-q8",
        tokenizer,
        quantization_method="q8_0",  # ~650MB, better quality for Mac
    )
    print("  ✅ Q8_0 exported")
except Exception as e:
    print(f"  ⚠️ Q8 export failed: {e}")

# ==============================================================================
# Cell 8: Push Everything to HuggingFace
# ==============================================================================

from huggingface_hub import HfApi, create_repo

api = HfApi()

# Create repo if it doesn't exist
try:
    create_repo(OUTPUT_REPO, private=False, exist_ok=True)
    print(f"📤 Pushing to {OUTPUT_REPO}...")
except Exception as e:
    print(f"Repo creation: {e}")

# Push merged model
model.push_to_hub(OUTPUT_REPO, tokenizer=tokenizer)
print("  ✅ Full model pushed")

# Push GGUF files
for gguf_dir in ["nl2shell-gguf-q4", "nl2shell-gguf-q8"]:
    if os.path.exists(gguf_dir):
        for f in os.listdir(gguf_dir):
            if f.endswith(".gguf"):
                api.upload_file(
                    path_or_fileobj=os.path.join(gguf_dir, f),
                    path_in_repo=f"gguf/{f}",
                    repo_id=OUTPUT_REPO,
                )
                print(f"  ✅ Uploaded {f}")

# Push a model card
MODEL_CARD = """---
license: mit
base_model: Qwen/Qwen3-0.6B
tags:
  - nl2bash
  - shell
  - terminal
  - command-line
  - qwen
  - qlora
  - lecoder
datasets:
  - AnonymousSub/NL2Bash
  - aelhalili/bash-commands-dataset
language:
  - en
pipeline_tag: text-generation
---

# NL2Shell 0.6B — Natural Language to Shell Commands

Ultra-lightweight model for converting natural language to Unix/macOS shell commands.
Fine-tuned from Qwen3-0.6B using QLoRA on NL2Bash + custom macOS command pairs.

## Usage

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("AryaYT/nl2shell-0.6b")
tokenizer = AutoTokenizer.from_pretrained("AryaYT/nl2shell-0.6b")
```

### With Ollama (GGUF)
```bash
# Download the Q4_K_M GGUF (~400MB) for Raspberry Pi
# Download the Q8_0 GGUF (~650MB) for Mac/Desktop
```

## Training Details
- Base: Qwen/Qwen3-0.6B
- Method: QLoRA (rank 32, all linear layers)
- Data: NL2Bash + macOS synthetic pairs
- Hardware: Google Colab Pro A100
- Built by: [Arya Teja](https://aryateja.com) | [LeCoder](https://lecoder.lesearch.ai)
"""

api.upload_file(
    path_or_fileobj=MODEL_CARD.encode(),
    path_in_repo="README.md",
    repo_id=OUTPUT_REPO,
)
print("  ✅ Model card uploaded")

print(f"\n🎉 Done! Model live at: https://huggingface.co/{OUTPUT_REPO}")
print("You can now test it with:")
print(f"  ollama run hf.co/{OUTPUT_REPO}")

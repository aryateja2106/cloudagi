FROM oven/bun:1.3 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY src ./src
COPY static ./static

# Expose port
ENV PORT=8080
EXPOSE 8080

# Run
CMD ["bun", "run", "src/index.tsx"]

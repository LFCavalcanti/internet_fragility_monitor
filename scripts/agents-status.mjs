#!/usr/bin/env node
// Situação dos agentes de ticket lançados pelas sessões deste projeto.
// Uso e limites: docs/agents/parallel-work.md, seção "Monitoring running agents".
//
//   node scripts/agents-status.mjs            situação dos agentes em andamento
//   node scripts/agents-status.mjs --all      inclui os que já terminaram
//   node scripts/agents-status.mjs --watch    uma linha por alerta (para a ferramenta Monitor)
//
// Opções: --idle <min> (padrão 10), --max <min> (padrão 45), --since <horas> (padrão 12),
// --interval <s> (padrão 60, só no --watch).

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = { all: false, watch: false, idle: 10, max: 45, since: 12, interval: 60 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") options.all = true;
    else if (arg === "--watch") options.watch = true;
    else if (["--idle", "--max", "--since", "--interval"].includes(arg)) {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`valor inválido para ${arg}`);
      options[arg.slice(2)] = value;
    } else throw new Error(`opção desconhecida: ${arg}`);
  }
  return options;
}

// O Claude Code guarda as sessões em ~/.claude/projects/<caminho do projeto com tudo que não é letra ou dígito trocado por "-">.
function findProjectTranscriptDir() {
  const projectsDir = join(homedir(), ".claude", "projects");
  const slug = repoRoot.replace(/[^A-Za-z0-9]/g, "-").toLowerCase();
  if (!existsSync(projectsDir)) return null;
  const match = readdirSync(projectsDir).find((name) => name.toLowerCase() === slug);
  return match ? join(projectsDir, match) : null;
}

function listTranscripts(projectDir, sinceHours) {
  const cutoff = Date.now() - sinceHours * 3_600_000;
  const transcripts = [];
  for (const session of readdirSync(projectDir, { withFileTypes: true })) {
    if (!session.isDirectory()) continue;
    const subagentsDir = join(projectDir, session.name, "subagents");
    if (!existsSync(subagentsDir)) continue;
    for (const file of readdirSync(subagentsDir)) {
      const match = /^agent-(\w+)\.jsonl$/.exec(file);
      if (!match) continue;
      const path = join(subagentsDir, file);
      if (statSync(path).mtimeMs < cutoff) continue;
      transcripts.push({ id: match[1], path, metaPath: join(subagentsDir, `agent-${match[1]}.meta.json`) });
    }
  }
  return transcripts;
}

function readJsonLines(path) {
  const rows = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // A última linha pode estar pela metade enquanto o agente escreve.
    }
  }
  return rows;
}

function describeTool(block) {
  const input = block.input ?? {};
  const detail = input.description ?? input.command ?? input.file_path ?? input.pattern ?? "";
  return detail ? `${block.name}: ${String(detail).replace(/\s+/g, " ").slice(0, 70)}` : block.name;
}

const REPORT_DELIVERED = "Report delivered to your caller.";

// Terminado: o meta marca "finished", ou o relatório final foi entregue por ferramenta,
// ou (versões antigas do Claude Code) a última mensagem do agente fecha o turno com "end_turn".
// Em ferramenta: a última mensagem pede uma ferramenta e espera o resultado.
function readAgentState(transcript) {
  let meta = {};
  try {
    meta = JSON.parse(readFileSync(transcript.metaPath, "utf8"));
  } catch {
    // Sem meta: agente sem descrição.
  }

  const rows = readJsonLines(transcript.path);
  const stamps = rows.map((row) => Date.parse(row.timestamp)).filter(Number.isFinite);
  const messages = rows.filter((row) => row.type === "user" || row.type === "assistant");
  const last = messages.at(-1);
  const content = Array.isArray(last?.message?.content) ? last.message.content : [];
  const pendingTool = last?.type === "assistant" ? content.findLast((block) => block.type === "tool_use") : undefined;
  const reportDelivered = last?.type === "user" && JSON.stringify(content).includes(REPORT_DELIVERED);
  const endedTurn = last?.type === "assistant" && last.message.stop_reason === "end_turn" && !pendingTool;

  let state = "pensando";
  if (meta.finished === true || reportDelivered || endedTurn) state = "terminou";
  else if (pendingTool) state = `em ferramenta (${describeTool(pendingTool)})`;

  return {
    id: transcript.id,
    transcript: transcript.path,
    description: meta.description ?? "",
    type: meta.agentType ?? "",
    nested: Boolean(meta.parentAgentId),
    finished: state === "terminou",
    state,
    startedAt: stamps.length ? Math.min(...stamps) : null,
    lastActivityAt: stamps.length ? Math.max(...stamps) : null,
  };
}

function git(worktree, args) {
  return execFileSync("git", ["-C", worktree, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function readWorktree(agentId) {
  const worktree = join(repoRoot, ".claude", "worktrees", `agent-${agentId}`);
  if (!existsSync(worktree)) return null;
  try {
    const branch = git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const commits = Number(git(worktree, ["rev-list", "--count", "main..HEAD"]));
    const changed = git(worktree, ["status", "--porcelain"]).split("\n").filter(Boolean).length;
    return { path: worktree, branch, commits, changed };
  } catch {
    return { path: worktree, branch: "?", commits: NaN, changed: NaN };
  }
}

const minutesSince = (time, now) => (time === null ? NaN : Math.floor((now - time) / 60_000));

function alertsFor(agent, options, now) {
  if (agent.finished) return [];
  const alerts = [];
  const idle = minutesSince(agent.lastActivityAt, now);
  const elapsed = minutesSince(agent.startedAt, now);
  if (idle >= options.idle) alerts.push({ kind: "idle", text: `sem nenhuma ação há ${idle} min` });
  if (elapsed >= options.max) alerts.push({ kind: "max", text: `rodando há ${elapsed} min (limite ${options.max})` });
  return alerts;
}

function collect(options) {
  const projectDir = findProjectTranscriptDir();
  if (!projectDir) return [];
  return listTranscripts(projectDir, options.since)
    .map(readAgentState)
    .filter((agent) => !agent.nested)
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
}

function label(agent) {
  return `agent-${agent.id}${agent.description ? ` "${agent.description}"` : ""}`;
}

function printStatus(options) {
  const now = Date.now();
  const agents = collect(options).filter((agent) => options.all || !agent.finished);
  if (agents.length === 0) {
    console.log(options.all ? "Nenhum agente nas últimas horas." : "Nenhum agente em andamento.");
    return;
  }
  for (const agent of agents) {
    const worktree = readWorktree(agent.id);
    const alerts = alertsFor(agent, options, now);
    console.log(`${alerts.length ? "!!" : "  "} ${label(agent)}${agent.type ? ` [${agent.type}]` : ""}`);
    console.log(`     estado: ${agent.state}`);
    console.log(
      `     rodando há ${minutesSince(agent.startedAt, now)} min, última ação há ${minutesSince(agent.lastActivityAt, now)} min`,
    );
    if (worktree) {
      console.log(
        `     worktree: ${worktree.path} (${worktree.branch}, ${worktree.commits} commit(s) à frente da main, ${worktree.changed} arquivo(s) alterado(s))`,
      );
    }
    console.log(`     transcrito: ${agent.transcript}`);
    for (const alert of alerts) console.log(`     ALERTA: ${alert.text}`);
  }
}

// Emite uma linha por alerta novo. O alerta de inatividade volta a valer quando o agente age de novo.
// Termina quando não sobra agente em andamento, para a ferramenta Monitor não ficar armada à toa.
async function watch(options) {
  const raised = new Map();
  for (;;) {
    let running = [];
    try {
      const now = Date.now();
      running = collect(options).filter((agent) => !agent.finished);
      for (const agent of running) {
        const seen = raised.get(agent.id) ?? new Set();
        const alerts = alertsFor(agent, options, now);
        if (!alerts.some((alert) => alert.kind === "idle")) seen.delete("idle");
        for (const alert of alerts) {
          if (seen.has(alert.kind)) continue;
          seen.add(alert.kind);
          console.log(`ALERTA ${label(agent)}: ${alert.text}; estado: ${agent.state}; transcrito: ${agent.transcript}`);
        }
        raised.set(agent.id, seen);
      }
    } catch (error) {
      console.log(`ERRO ao ler a situação dos agentes: ${error.message}`);
    }
    if (running.length === 0) {
      console.log("Nenhum agente em andamento; acompanhamento encerrado.");
      return;
    }
    await new Promise((done) => setTimeout(done, options.interval * 1000));
  }
}

const options = parseArgs(process.argv.slice(2));
if (options.watch) await watch(options);
else printStatus(options);

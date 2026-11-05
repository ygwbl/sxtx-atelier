#!/usr/bin/env node
/**
 * 纸境工坊 · 数据快照与回滚 (v26 / B6)
 * 零依赖，仅使用 Node 标准库。
 *
 *   node scripts/data-snapshot.js snapshot              创建快照
 *   node scripts/data-snapshot.js list                  列出快照
 *   node scripts/data-snapshot.js rollback <name>       回滚（自动先备份现状）
 *
 * 快照写入 data/snapshots/<UTC时间戳>/，该目录由脚本自动加入 .gitignore。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const SNAP = path.join(DATA, 'snapshots');
const FILES = ['articles.json', 'moments.json', 'messages.json', 'config.json', 'resonances.json'];
const KEEP = 20;

function stamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
}

function ensureDirs() {
  if (!fs.existsSync(SNAP)) fs.mkdirSync(SNAP, { recursive: true });
  const ignore = path.join(SNAP, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n!.gitignore\n', 'utf-8');
}

function take(label) {
  ensureDirs();
  const name = stamp() + (label ? '-' + label : '');
  const dir = path.join(SNAP, name);
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  for (const f of FILES) {
    const src = path.join(DATA, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dir, f));
      saved.push(f);
    }
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    name, createdAt: new Date().toISOString(), label: label || '', files: saved
  }, null, 2), 'utf-8');
  prune();
  console.log('[snapshot] 已保存 ' + name + ' (' + saved.length + ' 个文件)');
  return name;
}

function prune() {
  const dirs = fs.readdirSync(SNAP).filter(d => fs.statSync(path.join(SNAP, d)).isDirectory()).sort();
  while (dirs.length > KEEP) {
    const old = dirs.shift();
    fs.rmSync(path.join(SNAP, old), { recursive: true, force: true });
    console.log('[snapshot] 清理旧快照 ' + old);
  }
}

function list() {
  ensureDirs();
  const dirs = fs.readdirSync(SNAP).filter(d => fs.statSync(path.join(SNAP, d)).isDirectory()).sort().reverse();
  if (!dirs.length) return console.log('尚无快照。');
  dirs.forEach(d => {
    const mf = path.join(SNAP, d, 'manifest.json');
    const meta = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf-8')) : {};
    console.log(d + '  ' + (meta.files || []).length + ' 文件  ' + (meta.label || ''));
  });
}

function rollback(name) {
  ensureDirs();
  const dir = path.join(SNAP, name);
  if (!fs.existsSync(dir)) {
    console.error('[rollback] 找不到快照: ' + name);
    process.exit(1);
  }
  take('before-rollback');
  for (const f of FILES) {
    const src = path.join(dir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DATA, f));
  }
  console.log('[rollback] 已恢复 ' + name + '，现状已另存为 before-rollback 快照。');
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'snapshot') take(arg || '');
else if (cmd === 'list') list();
else if (cmd === 'rollback' && arg) rollback(arg);
else {
  console.log('用法: node scripts/data-snapshot.js snapshot [标签] | list | rollback <快照名>');
  process.exit(1);
}

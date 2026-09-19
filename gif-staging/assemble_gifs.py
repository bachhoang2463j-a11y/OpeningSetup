#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""摆拍 webm → 16:9 镜头切换 GIF/WebP 渲染流水线。

用法（在 gif-staging 目录下）：
  python assemble_gifs.py --scene 狂战士          # 渲染单个场景
  python assemble_gifs.py --all                  # 渲染全部
  python assemble_gifs.py --all --dry-run        # 只打印 ffmpeg 命令
  python assemble_gifs.py --all --scale 640x360  # 更高分辨率重渲

导演单：cuts/sN_*.json（segments 用 1280×860 源坐标系的绝对秒）。
镜头预设 CAMERAS 的矩形按 7 场景实测元素位置标定（引擎内容区 y∈[215,815]）。
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CUTS_DIR = ROOT / "cuts"
OUT_DIR = ROOT / "_out"

# cam 预设：rect=[x,y,w,h]（1280×860 源坐标）；zoom=[起,止] 走 zoompan 推镜；
# pan=[fx0,fx1,fy0,fy1] 为焦点在底板内的归一化位移（0,0=左上）
CAMERAS = {
    "wide":       {"rect": [0, 215, 1066, 600]},
    "cu_hero":    {"rect": [0, 485, 560, 315]},
    "cu_ally":    {"rect": [60, 470, 560, 315]},
    "cu_target":  {"rect": [450, 290, 560, 315]},
    "push_hero":  {"rect": [0, 387, 760, 428], "zoom": [1.0, 1.35], "pan": [0.5, 0.05, 0.5, 0.9]},
}
SHAKE = {"amp": 10, "w": 50, "decay": 5.0}  # 命中震屏：px / 角频率 rad·s⁻¹ / 衰减

FFMPEG = "ffmpeg"


def seg_chain(idx, seg, out_w, out_h, fps):
    cam = CAMERAS[seg["cam"]]
    x, y, w, h = cam["rect"]
    dur = seg["t1"] - seg["t0"]
    c = [f"[0:v]trim=start={seg['t0']:.3f}:end={seg['t1']:.3f}", "setpts=PTS-STARTPTS"]
    if "zoom" in cam:
        z0, z1 = cam["zoom"]
        p = cam.get("pan", [0.5, 0.5, 0.5, 0.5])
        n = max(2, round(dur * fps))
        plate_w, plate_h = out_w * 2, out_h * 2
        c += [
            f"crop={w}:{h}:{x}:{y}",
            f"fps={fps}",
            f"scale={plate_w}:{plate_h}:flags=lanczos",
            "setsar=1",
            (f"zoompan=z='{z0}+({z1}-{z0})*on/{n}'"
             f":x='(iw-iw/zoom)*({p[0]}+({p[1]}-{p[0]})*on/{n})'"
             f":y='(ih-ih/zoom)*({p[2]}+({p[3]}-{p[2]})*on/{n})'"
             f":d=1:s={out_w}x{out_h}:fps={fps}"),
        ]
    elif seg.get("shake"):
        a, om, d = SHAKE["amp"], SHAKE["w"], SHAKE["decay"]
        cx = f"'{x}+{a}*sin({om}*t)*exp(-{d}*t)'"
        cy = f"'{y}+{round(a * 0.7)}*cos({om}*t)*exp(-{d}*t)'"
        c += [f"crop={w}:{h}:{cx}:{cy}", f"fps={fps}", f"scale={out_w}:{out_h}:flags=lanczos"]
    else:
        c += [f"crop={w}:{h}:{x}:{y}", f"fps={fps}", f"scale={out_w}:{out_h}:flags=lanczos"]
    c.append("setsar=1")
    return ",".join(c) + f"[v{idx}]"


def build_filter(cut, out_w, out_h, fps, want_gif, want_webp):
    chains, labels = [], []
    for i, seg in enumerate(cut["segments"]):
        chains.append(seg_chain(i, seg, out_w, out_h, fps))
        labels.append(f"[v{i}]")
    n = len(cut["segments"])
    fc = ";".join(chains)
    fc += f";{''.join(labels)}concat=n={n}:v=1:a=0[vc]"
    outs = []
    if want_gif and want_webp:
        fc += ";[vc]split=3[vg][vp][vw];[vg]palettegen=stats_mode=diff[plt];[vp][plt]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle[g];[vw]format=yuv420p[w]"
        outs = ["[g]", "[w]"]
    elif want_gif:
        fc += ";[vc]split=2[vg][vp];[vg]palettegen=stats_mode=diff[plt];[vp][plt]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle[g]"
        outs = ["[g]"]
    else:
        fc += ";[vc]format=yuv420p[w]"
        outs = ["[w]"]
    return fc, outs


def render(cut, args):
    src = (ROOT / cut["source"]).resolve()
    if not src.exists():
        raise FileNotFoundError(src)
    out_w, out_h = (int(v) for v in args.scale.lower().split("x"))
    want_gif, want_webp = "gif" in args.formats, "webp" in args.formats
    fc, outs = build_filter(cut, out_w, out_h, args.fps, want_gif, want_webp)
    OUT_DIR.mkdir(exist_ok=True)
    cmd = [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(src),
           "-filter_complex", fc]
    results = []
    if want_gif:
        gif = OUT_DIR / f"{cut['output']}.gif"
        cmd += ["-map", outs[0], "-loop", "0", str(gif)]
        results.append(gif)
    if want_webp:
        webp = OUT_DIR / f"{cut['output']}.webp"
        cmd += (["-map", outs[-1], "-c:v", "libwebp", "-quality", "82", "-loop", "0", str(webp)]
                if want_gif else ["-map", outs[0], "-c:v", "libwebp", "-quality", "82", "-loop", "0", str(webp)])
        results.append(webp)
    if args.dry_run:
        print(" ".join(cmd))
        return
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"[FAIL] {cut['scene']}\n{r.stderr[-2000:]}", file=sys.stderr)
        raise SystemExit(1)
    sizes = "  ".join(f"{p.name} {p.stat().st_size / 1024:.0f}KB" for p in results)
    print(f"[OK] {cut['scene']}  {sizes}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--scene", help="场景关键词（匹配导演单文件名或输出名，如 狂战士 / s2）")
    g.add_argument("--all", action="store_true")
    ap.add_argument("--scale", default="480x270")
    ap.add_argument("--fps", type=int, default=15)
    ap.add_argument("--formats", default="gif,webp")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cuts = sorted(CUTS_DIR.glob("s*.json"))
    if not cuts:
        raise SystemExit(f"cuts 目录无导演单：{CUTS_DIR}")
    if args.all:
        chosen = cuts
    else:
        chosen = [p for p in cuts if args.scene in p.stem or args.scene in p.name]
        if not chosen:
            raise SystemExit(f"无匹配场景：{args.scene}（可选：{', '.join(p.stem for p in cuts)}）")
    for p in chosen:
        with open(p, encoding="utf-8") as f:
            render(json.load(f), args)


if __name__ == "__main__":
    main()

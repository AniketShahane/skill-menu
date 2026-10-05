#!/bin/zsh
# One-time toolchain for explainer videos. Idempotent: re-run any time; it only installs what's missing.
#   scripts/setup.sh           check + install
#   scripts/setup.sh --check   report only
# Installs (all in user space except Homebrew packages):
#   brew: ffmpeg, pkgconf, cairo, pango (needed to build pycairo for Manim)
#   uv-managed Python 3.12 venv at ~/.local/share/explainer-video/venv with manim==0.21.0
#   TinyTeX at ~/Library/TinyTeX (macOS) or ~/.TinyTeX (Linux) + the LaTeX packages Manim needs
set -u
CHECK=${1:-}
VENV=${EXPLAINER_VENV:-$HOME/.local/share/explainer-video/venv}
MANIM_VERSION=0.21.0
ok()   { print -P "  %F{green}ok%f    $1"; }
miss() { print -P "  %F{yellow}miss%f  $1"; }
die()  { print -P "  %F{red}FAIL%f  $1"; exit 1; }
need_install=0

echo "== system tools"
if [[ $(uname) == Darwin ]]; then
  command -v brew >/dev/null || die "Homebrew is required: https://brew.sh"
  for f in ffmpeg pkgconf cairo pango; do
    if brew list --formula $f >/dev/null 2>&1; then ok $f
    else miss $f; need_install=1; [[ $CHECK == --check ]] || brew install -q $f || die "brew install $f"; fi
  done
else
  for c in ffmpeg pkg-config; do command -v $c >/dev/null && ok $c || { miss "$c (sudo apt install zsh ffmpeg pkg-config libcairo2-dev libpango1.0-dev)"; need_install=1; }; done
  pkg-config --exists cairo pangocairo 2>/dev/null && ok "cairo/pango dev libs" || { miss "cairo/pango dev libs (sudo apt install libcairo2-dev libpango1.0-dev)"; need_install=1; }
fi
if command -v uv >/dev/null; then ok uv
else
  miss uv; need_install=1
  if [[ $CHECK != --check ]]; then
    if [[ $(uname) == Darwin ]]; then brew install -q uv || die "brew install uv"
    else curl -LsSf https://astral.sh/uv/install.sh | sh && export PATH=$HOME/.local/bin:$PATH; fi
  fi
fi

echo "== python venv ($VENV)"
if [[ -x $VENV/bin/python ]] && $VENV/bin/python -c "import manim,sys; sys.exit(manim.__version__!='$MANIM_VERSION')" 2>/dev/null; then
  ok "manim $MANIM_VERSION"
else
  miss "manim $MANIM_VERSION"; need_install=1
  if [[ $CHECK != --check ]]; then
    mkdir -p ${VENV:h}
    uv venv -q --python 3.12 $VENV || die "uv venv"
    PKG_CONFIG_PATH=$(brew --prefix 2>/dev/null)/lib/pkgconfig:${PKG_CONFIG_PATH:-} \
      uv pip install -q --python $VENV/bin/python "manim==$MANIM_VERSION" numpy || die "pip install manim (cairo/pango dev libs present?)"
    ok "manim installed"
  fi
fi

echo "== LaTeX (TinyTeX)"
if [[ $(uname) == Darwin ]]; then TT=$HOME/Library/TinyTeX; TB=$TT/bin/universal-darwin
else TT=$HOME/.TinyTeX; TB=($TT/bin/*-linux(N)); TB=${TB[1]:-$TT/bin/x86_64-linux}; fi
if [[ ! -x $TB/latex ]]; then
  miss "TinyTeX"; need_install=1
  if [[ $CHECK != --check ]]; then
    # The GitHub release is more reliable than the yihui.org installer, which can stall mid-download.
    os=$([[ $(uname) == Darwin ]] && echo darwin || echo linux-$(uname -m | sed 's/aarch64/arm64/'))
    url=$(curl -s https://api.github.com/repos/rstudio/tinytex-releases/releases/latest \
          | grep -o "https://[^\"]*TinyTeX-1-$os-v[^\"]*\.\(tar\.xz\|tgz\|tar\.gz\)" | head -1)
    [[ -n $url ]] || die "could not find a TinyTeX release for $os"
    tmp=$(mktemp -d); curl -sSL --retry 5 --retry-all-errors -o $tmp/tt "$url" || die "TinyTeX download"
    mkdir -p ${TT:h}; tar xf $tmp/tt -C ${TT:h} || die "TinyTeX unpack"; rm -rf $tmp
    [[ -d $TT ]] || mv ${TT:h}/.TinyTeX $TT 2>/dev/null
    TB=($TT/bin/*(N)); TB=${TB[1]}
  fi
fi
if [[ -x $TB/latex ]]; then
  ok "latex"
  export PATH=$TB:$PATH
  pkgs=(standalone preview doublestroke relsize everysel ragged2e fundus-calligra microtype wasysym physics dvisvgm setspace rsfs)
  if [[ ! -x $TB/dvisvgm ]] || ! kpsewhich standalone.cls >/dev/null 2>&1; then
    miss "LaTeX packages"; need_install=1
    [[ $CHECK == --check ]] || tlmgr install $pkgs >/dev/null 2>&1 || die "tlmgr install"
  fi
  [[ -x $TB/dvisvgm ]] && ok dvisvgm
fi

echo "== smoke test"
if [[ $CHECK != --check || $need_install == 0 ]]; then
  tmp=$(mktemp -d)
  cat > $tmp/t.py <<'EOF'
from manim import *
class T(Scene):
    def construct(self):
        self.add(MathTex(r"\hat{x} = \frac{", r"\sigma^2", r"}{2}"), Text("ok"))
EOF
  if (cd $tmp && $VENV/bin/manim -ql -s --disable_caching t.py T >log 2>&1); then ok "manim + LaTeX render"
  else tail -5 $tmp/log; die "smoke render failed (log: $tmp/log)"; fi
fi

echo "== narration"
if [[ -n ${GEMINI_API_KEY:-} ]] || security find-generic-password -s gemini-api-key >/dev/null 2>&1; then
  ok "Gemini key found (env or Keychain 'gemini-api-key')"
else
  miss "Gemini key — store once (it prompts for the key, so it stays out of shell history):"
  echo '        security add-generic-password -U -a "$USER" -s gemini-api-key -w'
  command -v say >/dev/null && echo "        (macOS 'say' works as a fallback voice: set \"backend\": \"say\" in video.json)"
fi
[[ $CHECK == --check && $need_install == 1 ]] && { echo "== some pieces missing: run without --check to install"; exit 1; }
echo "== ready"

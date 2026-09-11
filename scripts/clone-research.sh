#!/bin/sh
set -eu
destination="${1:-flybrain-research}"
git clone --depth 1 --filter=blob:none --sparse https://github.com/eonsystemspbc/fly-brain.git "$destination"
git -C "$destination" fetch --depth 1 origin a3db62f9436074e485c0278290c2164ed6150808
git -C "$destination" checkout a3db62f9436074e485c0278290c2164ed6150808
git -C "$destination" sparse-checkout set code scripts

import { MprisConstants } from "./MprisConstants.js";

// Per-instance suffixes some players append to their bus name:
//   org.mpris.MediaPlayer2.firefox.instance_1_42   (Firefox)
//   org.mpris.MediaPlayer2.chromium.instance12345  (Chromium family)
const INSTANCE_SUFFIX = /\.instance(?:_\d+_\d+|\d+)$/i;

// Bus names that are not media players: BlueZ and audio servers (excluded
// for main-thread safety), and playerctld, which only forwards to a real
// player that is already listed on its own bus name.
const NON_PLAYER_BASES = ["bluez", "pulseaudio", "pipewire", "playerctld"];

/** Bus name without its instance suffix, so all windows of one app group. */
export function stripInstanceSuffix(busName) {
  return busName.replace(INSTANCE_SUFFIX, "");
}

/** Short lowercase app key: "org.mpris.MediaPlayer2.vlc" -> "vlc". */
export function shortAppName(busName) {
  return stripInstanceSuffix(busName)
    .replace(`${MprisConstants.MPRIS_PREFIX}.`, "")
    .toLowerCase();
}

/** True for bus names that must never appear as a media player. */
export function isNonPlayerBus(busName) {
  const short = shortAppName(busName);
  return NON_PLAYER_BASES.some(
    (base) => short === base || short.startsWith(`${base}.`),
  );
}

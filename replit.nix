{pkgs}: {
  deps = [
    pkgs.yt-dlp
    # Required for DZ Tube audio extraction: converts/remuxes m4a + mp3 and
    # merges separate video/audio streams into a single mp4. Without ffmpeg
    # only muxed 360p video (format 18) can be served.
    pkgs.ffmpeg
  ];
}

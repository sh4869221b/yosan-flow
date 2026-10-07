{
  description = "Cache-only Linux E2E prerequisites for yosan-flow";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/151fa4e8ddfdd8dd25d945ad94ed54a13de9f6e4";

  outputs = { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      project = builtins.fromJSON (builtins.readFile ./package.json);
      nodeVersion = pkgs.lib.removeSuffix "\n" (builtins.readFile ./.node_version);
      browsers = (builtins.fromJSON (builtins.readFile
        "${nixpkgs}/pkgs/development/web/playwright/browsers.json")).browsers;
      driver = pkgs.playwright-driver;
      # Nixpkgs pnpm is 12.9.0; use the exact published npm bundle without
      # compiling the newer pnpm Rust implementation or changing packageManager.
      pnpmVersion = "12.9.1";
      pnpmSource = assert project.packageManager == "pnpm@${pnpmVersion}";
        builtins.fetchTarball {
          url = "https://registry.npmjs.org/pnpm/-/pnpm-${pnpmVersion}.tgz";
          sha256 = "sha256-J1P3qwPmsq9AXvEuY7ILQnJzi4KffiN+m/viH2D4Wf8=";
        };
      pnpmNative = builtins.fetchTarball {
        url = "https://registry.npmjs.org/@pnpm/exe.linux-x64/-/exe.linux-x64-${pnpmVersion}.tgz";
        sha256 = "sha256-BpfzKeM4Qa5DHc6aRgJnm2iMtJd3DRDXrUBU0gr+MgM=";
      };
      packages = {
        node = assert pkgs.nodejs-slim_24.version == nodeVersion; pkgs.nodejs-slim_24;
        headless-shell = assert driver.version == "1.63.0";
          assert browsers.chromium-headless-shell.revision == "1243";
          driver.components.chromium-headless-shell;
        ffmpeg = assert browsers.ffmpeg.revision == "1011"; driver.components.ffmpeg;
        fonts = pkgs.noto-fonts-cjk-sans;
        dejavu = pkgs.dejavu_fonts;
        fontconfig = pkgs.fontconfig;
        bash = pkgs.bash;
        coreutils = pkgs.coreutils;
      };
    in {
      packages.${system} = packages;
      # Only existing nixpkgs outputs: no custom derivation or browser source build.
      e2eManifest = {
        inherit nodeVersion;
        inherit pnpmVersion pnpmSource pnpmNative;
        playwrightVersion = driver.version;
        headlessShell = browsers.chromium-headless-shell;
        ffmpeg = browsers.ffmpeg;
        paths = builtins.mapAttrs (_: value: "${value}") packages;
      };
    };
}

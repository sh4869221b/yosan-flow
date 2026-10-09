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
      # Renovate owns packageManager and its archive integrity pins in pnpm-lock.yaml.
      # Preparation checks them before extracting or running the published binary.
      pnpmMatch = builtins.match "pnpm@([0-9]+\\.[0-9]+\\.[0-9]+)" project.packageManager;
      pnpmVersion = assert pnpmMatch != null; builtins.head pnpmMatch;
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
        inherit pnpmVersion;
        playwrightVersion = driver.version;
        headlessShell = browsers.chromium-headless-shell;
        ffmpeg = browsers.ffmpeg;
        paths = builtins.mapAttrs (_: value: "${value}") packages;
      };
    };
}

# Adi Music Desktop

The desktop shell is intentionally thin. It loads the live Adi Music web app instead of bundling a second copy of the UI.

## Development

From the repository root:

    pnpm electron:dev

By default the shell loads:

    https://music.imreallyadi.space

For local SvelteKit development:

    ADI_MUSIC_URL=http://localhost:5173 pnpm electron:dev

## Architecture

                         Adi Music
                             |
                    +--------+--------+
                    |                 |
                 Browser        Native shell
                    |                 |
                SvelteKit      +-------+-------+
                    |          |               |
                    |       Electron        Capacitor
                    |          |               |
                    |       Desktop         Android
                    |
                    +---- Shared web app ----+

The production Electron shell does not contain a compiled copy of the SvelteKit UI. It navigates to the production web app, so normal UI, player, discovery, lyrics, search, and API changes are deployed through the existing web deployment.

Native-only features are exposed through window.adiNative and can be implemented without forking the Svelte UI.

import io from 'socket.io-client'
import { createStorexHubSocketClient } from '@worldbrain/storex-hub/lib/client'
import { Application } from './application'
import { FileSettingsStore } from './settings'

function requireEnvVar(key: string) {
    const value = process.env[key]
    if (!value) {
        console.error(`Didn't get a ${key}`)
        process.exit(1)
    }
    return value
}

export async function main(options?: {
    port?: number
}) {
    const githubToken = requireEnvVar('GITHUB_TOKEN')
    const configPath = requireEnvVar('CONFIG_PATH')

    const port = options?.port || (process.env.NODE_ENV === 'production' ? 50482 : 50483)
    const socket = io(`http://localhost:${port}`)
    console.log('Connecting to Storex Hub')

    const application = new Application({
        settingsStore: new FileSettingsStore(configPath),
        defaultSettings: { githubToken }
    })
    await application.setup(callbacks => createStorexHubSocketClient(socket, callbacks))

    console.log('Connected to Storex Hub')
    await application.initializeSession()

    socket.on('reconnect', async () => {
        console.log('Re-connected to Storex Hub')
        await application.initializeSession()
    })
    socket.on('disconnect', async (reason: string) => {
        console.log('Lost connection to Storex Hub:', reason)
    })

    console.log('Setup complete')
}

if (require.main === module) {
    main()
}

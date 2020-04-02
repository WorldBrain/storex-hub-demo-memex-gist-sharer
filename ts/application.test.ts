import expect from 'expect'
import { createMultiApiTestFactory } from '@worldbrain/storex-hub/lib/tests/api/index.tests'
import { MemexTestingApp } from '@worldbrain/memex-storex-hub/lib/testing'
import { Tag, Page } from '@worldbrain/memex-storex-hub/lib/types/storex-types'
import { Application } from "./application"
import { MemorySettingsStore } from './settings'

describe('Memex Gist Sharer', () => {
    const it = createMultiApiTestFactory()

    it('should work', async ({ createSession }) => {
        const memex = new MemexTestingApp(options => createSession({ type: 'websocket', ...options }))
        await memex.connect()

        const settingsStore = new MemorySettingsStore({ githubToken: 'xyz' })
        const sharer = new Application({ settingsStore, defaultSettings: {}, logger: () => { } })
        await sharer.setup(async ({ callbacks }) => {
            const session = await createSession({ type: 'websocket', callbacks })
            return session.api
        })
        await sharer.initializeSession()

        let gist: string | undefined
        sharer.createOrUpdateGist = async content => { gist = content }

        const waitForUpload = new Promise((resolve, reject) => {
            sharer.events.once('uploaded', resolve)
        })

        const page: Page = {
            fullUrl: 'https://www.bla.com/foo',
            fullTitle: 'bla.com: Foo',
            url: 'bla.com/foo',
            domain: 'www.bla.com',
            hostname: 'bla.com'
        }
        await sharer.client.executeRemoteOperation({
            app: 'memex',
            operation: ['createObject', 'pages', page]
        })
        const tag: Tag = { name: 'share-gist', url: 'bla.com/foo' }
        await sharer.client.executeRemoteOperation({
            app: 'memex',
            operation: ['createObject', 'tags', tag]
        })

        await waitForUpload
        expect(gist).toEqual(
            `# My shared pages\n\n` +
            `  * [bla.com: Foo](https://www.bla.com/foo)\n`
        )
    })
})

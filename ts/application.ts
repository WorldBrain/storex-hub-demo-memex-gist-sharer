import some from 'lodash/some'
import { EventEmitter } from 'events'
const GistClient = require("gist-client")
import { StorexHubApi_v0, StorexHubCallbacks_v0 } from '@worldbrain/storex-hub/lib/public-api'
import { StorageOperationChangeInfo } from '@worldbrain/storex-middleware-change-watcher/lib/types'
import { Settings, StorageData, TagsByPage, SettingsStore } from './types'
import { SHARE_TAG_NAME, SPECIAL_GIST_FILENAME, APP_NAME } from './constants'

type Logger = (...args: any[]) => void
export class Application {
    events = new EventEmitter()

    private _client?: StorexHubApi_v0
    private settings?: Settings
    private logger: Logger

    get client() {
        if (!this._client) {
            throw new Error(`Tried to acces this.client, but it's not set up yet`)
        }
        return this._client
    }

    constructor(private options: {
        settingsStore: SettingsStore
        defaultSettings: Partial<Settings>
        logger?: Logger
    }) {
        this.logger = options.logger || console.log.bind(console)
    }

    async setup(createClient: (options: {
        callbacks: StorexHubCallbacks_v0
    }) => Promise<StorexHubApi_v0>) {
        await this.loadSettings()

        this._client = await createClient({
            callbacks: {
                handleEvent: async ({ event }) => {
                    if (event.type === 'storage-change' && event.app === 'memex') {
                        this.handleMemexStorageChange(event.info)
                    }
                    else if (event.type === 'app-availability-changed' && event.app === 'memex') {
                        this.logger('Changed Memex availability:', event.availability ? 'up' : 'down')
                        if (event.availability) {
                            this.tryToSubscribeToMemex()
                        }
                    }
                },
            },
        })
    }

    async loadSettings() {
        const settings = await this.options.settingsStore.loadSettings()
        const githubToken = settings.githubToken || this.options.defaultSettings.githubToken
        if (!githubToken) {
            throw new Error(`ERROR: No GitHub token provided in neither GITHUB_TOKEN env var, nor the settings file`)
        }
        this.settings = {
            ...settings,
            githubToken,
        }
    }

    async handleMemexStorageChange(info: StorageOperationChangeInfo<'post'>) {
        const hasInterestingChange = some(info.changes, change => change.collection === 'tags')
        if (!hasInterestingChange) {
            return
        }
        this.logger('Detected change to Memex tags')
        const data = await this.fetchStorageData()
        const gist = this.renderGist(data)
        await this.createOrUpdateGist(gist)
        this.logger('Successfuly created new Gist')
        this.events.emit('uploaded')
    }

    async fetchStorageData(): Promise<StorageData> {
        const tagsResponse = await this.client!.executeRemoteOperation({
            app: 'memex',
            operation: ['findObjects', 'tags', { name: SHARE_TAG_NAME }]
        })
        if (tagsResponse.status !== 'success') {
            throw new Error(`Error while fetching URLs for tag '${SHARE_TAG_NAME}'`)
        }

        const pageUrls = (tagsResponse.result as Array<{
            url: string
        }>).map(tag => tag.url)
        const pageTagsResponse = await this.client.executeRemoteOperation({
            app: 'memex',
            operation: ['findObjects', 'tags', { url: { $in: pageUrls } }]
        })
        if (pageTagsResponse.status !== 'success') {
            throw new Error(`Error while all tags for shared pages`)
        }

        const pagesRespone = await this.client.executeRemoteOperation({
            app: 'memex',
            operation: ['findObjects', 'pages', { url: { $in: pageUrls } }]
        })
        if (pagesRespone.status !== 'success') {
            throw new Error(`Error while fetching info for tagged pages from Memex`)
        }

        const tagsByPage: TagsByPage = {}
        for (const tag of pageTagsResponse.result) {
            tagsByPage[tag.url] = tagsByPage[tag.url] || []
            tagsByPage[tag.url].push(tag.name)
        }

        return { tagsByPage, pages: pagesRespone.result }
    }

    renderGist(data: StorageData) {
        const lines = ['# My shared pages', '']
        lines.push(...data.pages.map(page => {
            const pageTags = data.tagsByPage[page.url]
            const selectedTags = pageTags.filter(tag => tag !== SHARE_TAG_NAME)
            const renderedTags = selectedTags.length ? ` (${selectedTags.join(', ')})` : ''
            const renderedLink = `[${page.fullTitle}](${page.fullUrl})`
            return `  * ${renderedLink}${renderedTags}`
        }))
        lines.push('')
        return lines.join('\n')
    }

    createGistClient() {
        return new GistClient()
    }

    async createOrUpdateGist(content: string) {
        const gistClient = this.createGistClient()
        gistClient.setToken(this.settings!.githubToken)
        const gistId = await this.getSpecialGistId(gistClient)
        if (!gistId) {
            await gistClient.create({
                files: {
                    [SPECIAL_GIST_FILENAME]: {
                        content
                    }
                },
                description: "Pages shared through Memex",
                public: true
            })
        }
        else {
            await gistClient.update(gistId, {
                files: {
                    [SPECIAL_GIST_FILENAME]: {
                        content
                    }
                }
            })
        }
    }
    async getSpecialGistId(gistClient: any) {
        const gists = await gistClient.getAll({
            filterBy: [
                { public: true },
                { filename: SPECIAL_GIST_FILENAME },
            ]
        })
        return gists.length ? gists[0].id : null
    }

    async registerOrIdentify() {
        this.logger(`Identifying with Storex Hub as '${APP_NAME}'`)
        if (this.settings?.['accessToken']) {
            const identificationResult = await this.client.identifyApp({
                name: APP_NAME,
                accessToken: this.settings['accessToken']
            })
            if (identificationResult.status !== 'success') {
                throw new Error(`Couldn't identify app '${APP_NAME}': ${identificationResult.status}`)
            }
        }
        else {
            const registrationResult = await this.client.registerApp({
                name: APP_NAME,
                identify: true,
            })
            if (registrationResult.status === 'success') {
                const accessToken = registrationResult.accessToken
                this.settings!.accessToken = accessToken
                await this.options.settingsStore.saveSettings(this.settings!)
            }
            else {
                throw new Error(`Couldn't register app '${APP_NAME}'": ${registrationResult.status}`)
            }
        }
        this.logger(`Successfuly identified with Storex Hub as '${APP_NAME}'`)
    }

    async tryToSubscribeToMemex() {
        const subscriptionResult = await this.client.subscribeToEvent({
            request: {
                type: 'storage-change',
                app: 'memex',
                collections: ['tags'],
            }
        })
        if (subscriptionResult.status === 'success') {
            this.logger('Successfuly subscribed to Memex storage changes')
        }
        else {
            this.logger('Could not subscribe to Memex storage changes (yet?):', subscriptionResult.status)
        }
    }

    async initializeSession() {
        await this.registerOrIdentify()
        await this.tryToSubscribeToMemex()
        await this.client.subscribeToEvent({
            request: {
                type: 'app-availability-changed'
            }
        })
    }
}

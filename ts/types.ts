import { Page } from "@worldbrain/memex-storex-hub/lib/types";

export interface Settings {
    githubToken: string
    accessToken?: string
}

export interface SettingsStore {
    loadSettings(): Promise<Partial<Settings>>
    saveSettings(settings: Settings): Promise<void>
}

export type TagsByPage = {
    [url: string]: Array<string>
}
export interface StorageData {
    pages: Page[]
    tagsByPage: TagsByPage
}

import { SettingsStore, Settings } from "./types";
import { writeFileSync, existsSync, readFileSync } from "fs";

export class FileSettingsStore implements SettingsStore {
    constructor(private path: string) {
    }

    async loadSettings(): Promise<Partial<Settings>> {
        const hasConfig = existsSync(this.path)
        const existingConfig = hasConfig ? JSON.parse(readFileSync(this.path).toString()) : null
        return existingConfig || {}
    }

    async saveSettings(settings: Settings) {
        writeFileSync(this.path, JSON.stringify(settings))
    }
}

export class MemorySettingsStore implements SettingsStore {
    constructor(private settings?: Settings) {
    }

    async loadSettings(): Promise<Partial<Settings>> {
        return this.settings || {}
    }

    async saveSettings(settings: Settings) {
        this.settings = settings
    }
}
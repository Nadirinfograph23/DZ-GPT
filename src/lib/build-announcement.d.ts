export interface BuildVersion { commit?: string; commitShort?: string; message?: string; deployedAt?: string }
export interface BuildAnnouncement { id: string; title: string; text: string; link: null; linkText: null; timestamp: number; from: string; badge: string; type: 'update' }
export function createBuildAnnouncement(version?: BuildVersion): BuildAnnouncement

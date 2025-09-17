// EPUB parsing utilities for extracting content from EPUB files

export interface EpubMetadata {
  title: string
  author: string
  language: string
  identifier: string
  description?: string
  publisher?: string
  date?: string
}

export interface EpubChapter {
  id: string
  title: string
  href: string
  content: string
  order: number
}

export interface EpubBook {
  metadata: EpubMetadata
  chapters: EpubChapter[]
  resources: Map<string, string> // href -> base64 content
  coverImage?: string
}

export class EpubParser {
  private zip: any
  private opfPath = ""
  private opfDir = ""

  async parseEpub(file: File): Promise<EpubBook> {
    // Import JSZip dynamically for client-side usage
    const JSZip = (await import("jszip")).default

    this.zip = new JSZip()
    const zipContent = await this.zip.loadAsync(file)

    // Find the OPF file from META-INF/container.xml
    await this.findOpfPath()

    // Parse metadata and manifest
    const opfContent = await this.getFileContent(this.opfPath)
    const opfDoc = this.parseXml(opfContent)

    const metadata = this.extractMetadata(opfDoc)
    const manifest = this.extractManifest(opfDoc)
    const spine = this.extractSpine(opfDoc)

    // Extract chapters in reading order
    const chapters = await this.extractChapters(spine, manifest)

    // Extract resources (images, CSS, etc.)
    const resources = await this.extractResources(manifest)

    // Find cover image
    const coverImage = await this.findCoverImage(manifest, metadata)

    return {
      metadata,
      chapters,
      resources,
      coverImage,
    }
  }

  private async findOpfPath(): Promise<void> {
    try {
      const containerContent = await this.getFileContent("META-INF/container.xml")
      const containerDoc = this.parseXml(containerContent)
      const rootfileElement = containerDoc.querySelector("rootfile")
      this.opfPath = rootfileElement?.getAttribute("full-path") || ""
      this.opfDir = this.opfPath.substring(0, this.opfPath.lastIndexOf("/") + 1)
    } catch (error) {
      throw new Error("Invalid EPUB: Could not find container.xml")
    }
  }

  private async getFileContent(path: string): Promise<string> {
    const file = this.zip.file(path)
    if (!file) {
      throw new Error(`File not found: ${path}`)
    }
    return await file.async("text")
  }

  private parseXml(xmlString: string): Document {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlString, "application/xml")

    if (doc.querySelector("parsererror")) {
      throw new Error("Invalid XML content")
    }

    return doc
  }

  private extractMetadata(opfDoc: Document): EpubMetadata {
    const getMetaContent = (name: string): string => {
      // Try different selector patterns for metadata elements
      let element = opfDoc.querySelector(`metadata [name="${name}"]`)
      if (!element) {
        element = opfDoc.querySelector(`metadata [property="${name}"]`)
      }
      if (!element && name.startsWith("dc:")) {
        // Handle Dublin Core namespace elements by looking for elements with the local name
        const localName = name.replace("dc:", "")
        const metadataElements = opfDoc.querySelectorAll("metadata *")

        for (const el of metadataElements) {
          if (el.localName === localName || el.tagName === localName || el.tagName === name) {
            element = el
            break
          }
        }
      }

      if (!element) {
        // Try without namespace prefix
        const localName = name.includes(":") ? name.split(":")[1] : name
        element = opfDoc.querySelector(`metadata ${localName}`)
      }

      return element?.textContent?.trim() || ""
    }

    return {
      title: getMetaContent("dc:title") || getMetaContent("title") || "Unknown Title",
      author: getMetaContent("dc:creator") || getMetaContent("creator") || "Unknown Author",
      language: getMetaContent("dc:language") || getMetaContent("language") || "en",
      identifier: getMetaContent("dc:identifier") || getMetaContent("identifier") || "",
      description: getMetaContent("dc:description") || getMetaContent("description"),
      publisher: getMetaContent("dc:publisher") || getMetaContent("publisher"),
      date: getMetaContent("dc:date") || getMetaContent("date"),
    }
  }

  private extractManifest(opfDoc: Document): Map<string, any> {
    const manifest = new Map()
    const items = opfDoc.querySelectorAll("manifest item")

    items.forEach((item) => {
      const id = item.getAttribute("id")
      const href = item.getAttribute("href")
      const mediaType = item.getAttribute("media-type")

      if (id && href) {
        manifest.set(id, {
          href: this.opfDir + href,
          mediaType,
          properties: item.getAttribute("properties"),
        })
      }
    })

    return manifest
  }

  private extractSpine(opfDoc: Document): string[] {
    const spine: string[] = []
    const itemrefs = opfDoc.querySelectorAll("spine itemref")

    itemrefs.forEach((itemref) => {
      const idref = itemref.getAttribute("idref")
      if (idref) {
        spine.push(idref)
      }
    })

    return spine
  }

  private async extractChapters(spine: string[], manifest: Map<string, any>): Promise<EpubChapter[]> {
    const chapters: EpubChapter[] = []

    for (let i = 0; i < spine.length; i++) {
      const id = spine[i]
      const manifestItem = manifest.get(id)

      if (manifestItem && manifestItem.mediaType === "application/xhtml+xml") {
        try {
          const content = await this.getFileContent(manifestItem.href)
          const doc = this.parseXml(content)

          // Extract title from h1, h2, or title tag
          const titleElement = doc.querySelector("h1, h2, h3, title")
          const title = titleElement?.textContent?.trim() || `Chapter ${i + 1}`

          // Extract body content
          const bodyElement = doc.querySelector("body")
          const bodyContent = bodyElement?.innerHTML || content

          chapters.push({
            id,
            title,
            href: manifestItem.href,
            content: bodyContent,
            order: i,
          })
        } catch (error) {
          console.warn(`Failed to load chapter ${id}:`, error)
        }
      }
    }

    return chapters
  }

  private async extractResources(manifest: Map<string, any>): Promise<Map<string, string>> {
    const resources = new Map<string, string>()

    for (const [id, item] of manifest) {
      if (
        item.mediaType?.startsWith("image/") ||
        item.mediaType === "text/css" ||
        item.mediaType?.startsWith("audio/")
      ) {
        try {
          const file = this.zip.file(item.href)
          if (file) {
            const content = await file.async("base64")
            resources.set(item.href, `data:${item.mediaType};base64,${content}`)
          }
        } catch (error) {
          console.warn(`Failed to load resource ${item.href}:`, error)
        }
      }
    }

    return resources
  }

  private async findCoverImage(manifest: Map<string, any>, metadata: EpubMetadata): Promise<string | undefined> {
    // Look for cover in manifest properties
    for (const [id, item] of manifest) {
      if (item.properties?.includes("cover-image") || id === "cover" || id === "cover-image") {
        try {
          const file = this.zip.file(item.href)
          if (file) {
            const content = await file.async("base64")
            return `data:${item.mediaType};base64,${content}`
          }
        } catch (error) {
          console.warn("Failed to load cover image:", error)
        }
      }
    }

    return undefined
  }
}

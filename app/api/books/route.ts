import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

export async function GET() {
  try {
    const booksDirectory = path.join(process.cwd(), "public", "books")

    // Check if books directory exists
    try {
      await fs.access(booksDirectory)
    } catch {
      // Directory doesn't exist, return empty array
      return NextResponse.json([])
    }

    const files = await fs.readdir(booksDirectory)
    const epubFiles = files.filter((file) => file.toLowerCase().endsWith(".epub"))

    const books = await Promise.all(
      epubFiles.map(async (filename) => {
        const filePath = path.join(booksDirectory, filename)
        const stats = await fs.stat(filePath)

        // Extract basic info from filename (you can enhance this later)
        const nameWithoutExt = filename.replace(".epub", "")
        const title = nameWithoutExt.replace(/[-_]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())

        return {
          name: filename,
          size: stats.size,
          metadata: {
            title: title,
            author: "Student Author", // Default, will be replaced when book is parsed
            language: "en",
          },
          chaptersCount: 0, // Will be updated when book is parsed
          uploadDate: stats.mtime.toISOString(),
        }
      }),
    )

    return NextResponse.json(books)
  } catch (error) {
    console.error("Error reading books directory:", error)
    return NextResponse.json([])
  }
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

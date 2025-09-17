"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, BookOpen, File, Loader2, Trash2, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { EpubParser, type EpubBook } from "@/lib/epub-parser"
import { useToast } from "@/hooks/use-toast"
import { ReadingInterface } from "@/components/reading-interface"

interface StoredBook {
  name: string
  size: number
  metadata: {
    title: string
    author: string
    language: string
  }
  chaptersCount: number
  uploadDate: string
  isPreloaded?: boolean // Added flag to identify preloaded books
}

interface UploadedFile {
  name: string
  size: number
  file: File
}

export default function EpubReader() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [storedBooks, setStoredBooks] = useState<StoredBook[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)
  const [parsedBooks, setParsedBooks] = useState<Map<string, EpubBook>>(new Map())
  const [loadingBooks, setLoadingBooks] = useState<Set<string>>(new Set())
  const [currentBook, setCurrentBook] = useState<EpubBook | null>(null)
  const [isReading, setIsReading] = useState(false)
  const { toast } = useToast()

  const loadPublicBooks = async (): Promise<StoredBook[]> => {
    try {
      const response = await fetch("/api/books")
      if (response.ok) {
        const books = await response.json()
        return books.map((book: any) => ({
          ...book,
          isPreloaded: true,
        }))
      }
    } catch (error) {
      console.log("No public books API available, using fallback")
    }
    return []
  }

  useEffect(() => {
    const initializeLibrary = async () => {
      const stored = localStorage.getItem("pearl-epub-library")
      let existingBooks: StoredBook[] = []

      if (stored) {
        try {
          existingBooks = JSON.parse(stored)
        } catch (error) {
          console.error("Failed to load stored books:", error)
        }
      }

      const publicBooks = await loadPublicBooks()

      const allBooks = [...publicBooks]
      existingBooks.forEach((book) => {
        if (!book.isPreloaded && !allBooks.some((b) => b.name === book.name)) {
          allBooks.push(book)
        }
      })

      setStoredBooks(allBooks)
    }

    initializeLibrary()
  }, [])

  useEffect(() => {
    if (storedBooks.length > 0) {
      localStorage.setItem("pearl-epub-library", JSON.stringify(storedBooks))
    }
  }, [storedBooks])

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return

    const epubFiles = Array.from(files).filter(
      (file) => file.name.toLowerCase().endsWith(".epub") || file.type === "application/epub+zip",
    )

    const newFiles = epubFiles.map((file) => ({
      name: file.name,
      size: file.size,
      file,
    }))

    setUploadedFiles((prev) => [...prev, ...newFiles])
  }

  const handleOpenBook = async (uploadedFile: UploadedFile) => {
    const fileName = uploadedFile.name

    if (parsedBooks.has(fileName)) {
      setCurrentBook(parsedBooks.get(fileName)!)
      return
    }

    setLoadingBooks((prev) => new Set(prev).add(fileName))

    try {
      const parser = new EpubParser()
      const book = await parser.parseEpub(uploadedFile.file)

      setParsedBooks((prev) => new Map(prev).set(fileName, book))
      setCurrentBook(book)

      const storedBook: StoredBook = {
        name: fileName,
        size: uploadedFile.size,
        metadata: {
          title: book.metadata.title,
          author: book.metadata.author,
          language: book.metadata.language,
        },
        chaptersCount: book.chapters.length,
        uploadDate: new Date().toISOString(),
      }

      setStoredBooks((prev) => {
        const existing = prev.find((b) => b.name === fileName)
        if (existing) return prev
        return [...prev, storedBook]
      })

      toast({
        title: "Book loaded successfully",
        description: `"${book.metadata.title}" is ready to read`,
      })
    } catch (error) {
      console.error("Failed to parse EPUB:", error)
      toast({
        title: "Failed to load book",
        description: "There was an error parsing the EPUB file",
        variant: "destructive",
      })
    } finally {
      setLoadingBooks((prev) => {
        const newSet = new Set(prev)
        newSet.delete(fileName)
        return newSet
      })
    }
  }

  const handleOpenStoredBook = async (storedBook: StoredBook) => {
    if (storedBook.isPreloaded) {
      try {
        const response = await fetch(`/books/${storedBook.name}`)
        if (response.ok) {
          const blob = await response.blob()
          const file = new File([blob], storedBook.name, { type: "application/epub+zip" })

          setLoadingBooks((prev) => new Set(prev).add(storedBook.name))

          const parser = new EpubParser()
          const book = await parser.parseEpub(file)

          setParsedBooks((prev) => new Map(prev).set(storedBook.name, book))
          setCurrentBook(book)

          setLoadingBooks((prev) => {
            const newSet = new Set(prev)
            newSet.delete(storedBook.name)
            return newSet
          })

          toast({
            title: "Book loaded successfully",
            description: `"${book.metadata.title}" is ready to read`,
          })
          return
        }
      } catch (error) {
        console.error("Failed to load public book:", error)
      }

      toast({
        title: "Book not available",
        description: "Please add EPUB files to the public/books directory",
        variant: "default",
      })
      return
    }

    if (parsedBooks.has(storedBook.name)) {
      setCurrentBook(parsedBooks.get(storedBook.name)!)
      return
    }

    const uploadedFile = uploadedFiles.find((f) => f.name === storedBook.name)
    if (uploadedFile) {
      await handleOpenBook(uploadedFile)
      return
    }

    toast({
      title: "File not found",
      description: "Please re-upload this book to read it",
      variant: "destructive",
    })
  }

  const handleDeleteBook = (bookName: string) => {
    setStoredBooks((prev) => prev.filter((book) => book.name !== bookName))
    setParsedBooks((prev) => {
      const newMap = new Map(prev)
      newMap.delete(bookName)
      return newMap
    })
    setUploadedFiles((prev) => prev.filter((file) => file.name !== bookName))

    toast({
      title: "Book removed",
      description: "Book has been removed from your library",
    })
  }

  const filteredStoredBooks = storedBooks.filter(
    (book) =>
      book.metadata.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.metadata.author.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const filteredUploadedFiles = uploadedFiles.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFileUpload(e.dataTransfer.files)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const startReading = () => {
    setIsReading(true)
  }

  const stopReading = () => {
    setIsReading(false)
  }

  if (currentBook && isReading) {
    return (
      <ReadingInterface
        book={currentBook}
        onBack={() => {
          stopReading()
        }}
      />
    )
  }

  if (currentBook) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card">
          <div className="max-w-4xl mx-auto p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setCurrentBook(null)}>
                ← Back to Library
              </Button>
              <div>
                <h1 className="text-xl font-semibold">{currentBook.metadata.title}</h1>
                <p className="text-sm text-muted-foreground">by {currentBook.metadata.author}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-4">
          <Card>
            <CardContent className="p-6">
              <div className="text-center py-8">
                <BookOpen className="h-16 w-16 text-primary mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">{currentBook.metadata.title}</h2>
                <p className="text-lg text-muted-foreground mb-4">by {currentBook.metadata.author}</p>
                <p className="text-muted-foreground mb-6">
                  {currentBook.chapters.length} chapters • {currentBook.metadata.language}
                </p>
                <Button size="lg" onClick={startReading}>
                  Start Reading
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 flex items-center justify-center gap-3">
            <BookOpen className="h-10 w-10" style={{ color: "#47E573" }} />
            <span style={{ color: "#2D8A47" }}>PEARL ePub Reader</span>
          </h1>
          <p className="text-muted-foreground text-lg">Upload and read your EPUB ebooks with audio support</p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Upload EPUB Files</CardTitle>
            <CardDescription>Drag and drop your EPUB files here or click to browse</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragOver ? "bg-green-50 dark:bg-green-950/20" : "border-muted-foreground/25 hover:border-green-400"
              }`}
              style={{
                borderColor: isDragOver ? "#47E573" : undefined,
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">Drop EPUB files here</p>
              <p className="text-muted-foreground mb-4">or</p>
              <Button
                className="text-white hover:opacity-90"
                style={{ backgroundColor: "#1F7A37" }}
                onClick={() => {
                  const input = document.createElement("input")
                  input.type = "file"
                  input.accept = ".epub,application/epub+zip"
                  input.multiple = true
                  input.onchange = (e) => {
                    const target = e.target as HTMLInputElement
                    handleFileUpload(target.files)
                  }
                  input.click()
                }}
              >
                Browse Files
              </Button>
            </div>
          </CardContent>
        </Card>

        {(storedBooks.length > 0 || uploadedFiles.length > 0) && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search your library..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 focus:ring-2 focus:ring-green-200 focus:border-green-400"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {(filteredStoredBooks.length > 0 || filteredUploadedFiles.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle>Your EPUB Library</CardTitle>
              <CardDescription>
                {storedBooks.length} book{storedBooks.length !== 1 ? "s" : ""} in your library
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredStoredBooks.map((book, index) => (
                  <div
                    key={`stored-${index}`}
                    className={`flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors ${
                      book.isPreloaded ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-8 w-8" style={{ color: book.isPreloaded ? "#47E573" : "#2D8A47" }} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{book.metadata.title}</p>
                          {book.isPreloaded && (
                            <span
                              className="px-2 py-1 text-xs rounded-full text-white"
                              style={{ backgroundColor: "#1F7A37" }}
                            >
                              Sample
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">by {book.metadata.author}</p>
                        <p className="text-xs text-muted-foreground">
                          {book.chaptersCount} chapters • {formatFileSize(book.size)}
                          {!book.isPreloaded && ` • Added ${new Date(book.uploadDate).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/20 bg-transparent"
                        onClick={() => handleOpenStoredBook(book)}
                        disabled={loadingBooks.has(book.name)}
                      >
                        {loadingBooks.has(book.name) ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Loading...
                          </>
                        ) : book.isPreloaded ? (
                          "View Demo"
                        ) : (
                          "Open Book"
                        )}
                      </Button>
                      {!book.isPreloaded && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteBook(book.name)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {filteredUploadedFiles
                  .filter((file) => !storedBooks.some((book) => book.name === file.name))
                  .map((file, index) => (
                    <div
                      key={`uploaded-${index}`}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                    >
                      <div className="flex items-center gap-3">
                        <File className="h-8 w-8" style={{ color: "#47E573" }} />
                        <div>
                          <p className="font-medium text-foreground">{file.name}</p>
                          <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
                          <p className="text-xs" style={{ color: "#2D8A47" }}>
                            New upload - Click to add to library
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-green-300 text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30 bg-transparent"
                        onClick={() => handleOpenBook(file)}
                        disabled={loadingBooks.has(file.name)}
                      >
                        {loadingBooks.has(file.name) ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Parsing...
                          </>
                        ) : (
                          "Add to Library"
                        )}
                      </Button>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {storedBooks.length === 0 && uploadedFiles.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium text-muted-foreground mb-2">Loading your library...</p>
              <p className="text-muted-foreground">Please wait while we set up your reading experience</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

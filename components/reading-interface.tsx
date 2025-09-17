"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { ChevronLeft, ChevronRight, Menu, Settings, BookOpen, ArrowLeft } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import type { EpubBook } from "@/lib/epub-parser"

interface ReadingInterfaceProps {
  book: EpubBook
  onBack: () => void
}

export function ReadingInterface({ book, onBack }: ReadingInterfaceProps) {
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0)
  const [fontSize, setFontSize] = useState(16)
  const [lineHeight, setLineHeight] = useState(1.6)
  const [maxWidth, setMaxWidth] = useState(700)

  const currentChapter = book.chapters[currentChapterIndex]

  const goToNextChapter = () => {
    if (currentChapterIndex < book.chapters.length - 1) {
      setCurrentChapterIndex(currentChapterIndex + 1)
    }
  }

  const goToPreviousChapter = () => {
    if (currentChapterIndex > 0) {
      setCurrentChapterIndex(currentChapterIndex - 1)
    }
  }

  const goToChapter = (index: number) => {
    setCurrentChapterIndex(index)
  }

  const processContent = (content: string): string => {
    let processedContent = content

    // Replace relative image sources with base64 data
    book.resources.forEach((dataUrl, href) => {
      const fileName = href.split("/").pop() || href

      // Handle image sources
      processedContent = processedContent.replace(
        new RegExp(`src=[\"']([^\"']*${fileName}[^\"']*)[\"']`, "gi"),
        `src="${dataUrl}"`,
      )

      // Handle audio sources - replace src attributes in audio elements
      if (dataUrl.startsWith("data:audio/")) {
        processedContent = processedContent.replace(
          new RegExp(`<audio([^>]*?)src=[\"']([^\"']*${fileName}[^\"']*)[\"']([^>]*?)>`, "gi"),
          `<audio$1src="${dataUrl}"$3 controls preload="metadata" style="width: 100%; max-width: 400px; margin: 1rem 0;">`,
        )

        // Handle source elements within audio tags
        processedContent = processedContent.replace(
          new RegExp(`<source([^>]*?)src=[\"']([^\"']*${fileName}[^\"']*)[\"']([^>]*?)>`, "gi"),
          `<source$1src="${dataUrl}"$3>`,
        )
      }
    })

    // Ensure all audio elements have controls and proper styling
    processedContent = processedContent.replace(
      /<audio(?![^>]*controls)([^>]*?)>/gi,
      '<audio$1 controls preload="metadata" style="width: 100%; max-width: 400px; margin: 1rem 0;">',
    )

    return processedContent
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Library
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">{book.metadata.title}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Table of Contents */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80">
                <SheetHeader>
                  <SheetTitle>Table of Contents</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-100px)] mt-4">
                  <div className="space-y-2">
                    {book.chapters.map((chapter, index) => (
                      <Button
                        key={chapter.id}
                        variant={index === currentChapterIndex ? "secondary" : "ghost"}
                        className="w-full justify-start text-left h-auto p-3"
                        onClick={() => goToChapter(index)}
                      >
                        <div>
                          <div className="font-medium text-sm">{chapter.title}</div>
                          <div className="text-xs text-muted-foreground">
                            Chapter {index + 1} of {book.chapters.length}
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            {/* Reading Settings */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Settings className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <SheetHeader>
                  <SheetTitle>Reading Settings</SheetTitle>
                </SheetHeader>
                <div className="space-y-6 mt-6">
                  <div className="space-y-3">
                    <Label>Font Size: {fontSize}px</Label>
                    <Slider
                      value={[fontSize]}
                      onValueChange={(value) => setFontSize(value[0])}
                      min={12}
                      max={24}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Line Height: {lineHeight}</Label>
                    <Slider
                      value={[lineHeight]}
                      onValueChange={(value) => setLineHeight(value[0])}
                      min={1.2}
                      max={2.0}
                      step={0.1}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Max Width: {maxWidth}px</Label>
                    <Slider
                      value={[maxWidth]}
                      onValueChange={(value) => setMaxWidth(value[0])}
                      min={500}
                      max={1000}
                      step={50}
                      className="w-full"
                    />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* Reading Content */}
      <div className="flex-1">
        <div className="mx-auto px-4 py-8" style={{ maxWidth: `${maxWidth}px` }}>
          <Card>
            <CardContent className="p-8">
              {/* Chapter Title */}
              <div className="mb-8">
                <h1 className="text-2xl font-bold mb-2">{currentChapter.title}</h1>
                <p className="text-sm text-muted-foreground">
                  Chapter {currentChapterIndex + 1} of {book.chapters.length}
                </p>
              </div>

              {/* Chapter Content */}
              <div
                className="prose prose-neutral dark:prose-invert max-w-none"
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: lineHeight,
                }}
                dangerouslySetInnerHTML={{
                  __html: processContent(currentChapter.content),
                }}
              />

              {/* Navigation */}
              <div className="flex items-center justify-between mt-12 pt-8 border-t">
                <Button variant="outline" onClick={goToPreviousChapter} disabled={currentChapterIndex === 0}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>

                <div className="text-sm text-muted-foreground">
                  {currentChapterIndex + 1} / {book.chapters.length}
                </div>

                <Button
                  variant="outline"
                  onClick={goToNextChapter}
                  disabled={currentChapterIndex === book.chapters.length - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

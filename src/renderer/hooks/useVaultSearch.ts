import { useState, useCallback } from 'react'
import type { FileInfo } from '../types'
import type { XyVaultAPI } from '../../shared/window'

const api: XyVaultAPI = window.api

export interface VaultSearchState {
  searchQuery: string
  searchResults: FileInfo[]
  showSearchResults: boolean
  setShowSearchResults: (v: boolean) => void
  handleSearch: (query: string) => Promise<void>
  handleCloseSearch: () => void
  handleOpenSearch: () => void
}

export function useVaultSearch() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FileInfo[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query)
    if (query.trim()) {
      const results = await api.searchFiles(query)
      setSearchResults(results)
      setShowSearchResults(true)
    } else {
      setSearchResults([])
      setShowSearchResults(false)
    }
  }, [])

  const handleCloseSearch = useCallback(() => {
    setSearchQuery('')
    setSearchResults([])
    setShowSearchResults(false)
  }, [])

  const handleOpenSearch = useCallback(() => {
    // Open search UI without triggering a search query
    setShowSearchResults(true)
    setSearchQuery('')
    setSearchResults([])
  }, [])

  return {
    searchQuery,
    searchResults,
    showSearchResults,
    setShowSearchResults,
    handleSearch,
    handleCloseSearch,
    handleOpenSearch,
  }
}

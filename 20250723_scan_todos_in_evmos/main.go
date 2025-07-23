// This script is a helper script to scan all todos in the folder given as the first
// argument. It will recursively scan all subfolders and list all Go-format comments containing
// a to-do.
package main

import (
	"bufio"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

const githubPath = "https://github.com/evmos/evmos/blob/4125a67eff"

// scanToDosInPath scans the given path for to-dos and prints them to stdout.
func scanToDosInPath(root string) error {
	// Check if the root exists and is a directory
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return fmt.Errorf("root directory does not exist or is not a directory: %v", err)
	}

	// Walk all files in the given root
	err = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		var (
			lineNumber     int
			relativePath   string
			fullGithubPath string
		)

		// Only process regular files, not directories or special files
		if err != nil || !info.Mode().IsRegular() {
			return err
		}

		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()

		// Scan the file line by line to find any lines containing "// TODO"
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			lineNumber++
			line := scanner.Text()
			if strings.Contains(line, "// TODO") {
				relativePath = strings.TrimPrefix(path, root)
				fullGithubPath, err = url.JoinPath(githubPath, relativePath)
				if err != nil {
					return fmt.Errorf("error while building the github root: %v", err)
				}
				fmt.Printf("%s#L%d: %s\n", fullGithubPath, lineNumber, strings.TrimSpace(line))
			}
		}

		return nil
	})
	if err != nil {
		return fmt.Errorf("error while walking the directory: %v", err)
	}

	return nil
}

func main() {
	if len(os.Args) != 2 {
		panic("expected exactly one argument, which is the path to scan")
	}
	path := os.Args[1]
	err := scanToDosInPath(path)
	if err != nil {
		panic(err)
	}
}

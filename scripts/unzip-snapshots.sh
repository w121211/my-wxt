#!/bin/bash

# Script to unzip all zip files in a target directory
# Each zip file will be extracted to a folder with the same name
# Usage: ./unzip-snapshots.sh <target_directory>

# Check if argument is provided
if [ -z "$1" ]; then
  echo "Error: No target directory specified"
  echo "Usage: $0 <target_directory>"
  exit 1
fi

SNAPSHOTS_DIR="$1"

# Check if directory exists
if [ ! -d "$SNAPSHOTS_DIR" ]; then
  echo "Error: Directory $SNAPSHOTS_DIR does not exist"
  exit 1
fi

# Navigate to snapshots directory
cd "$SNAPSHOTS_DIR" || exit 1

# Count zip files
zip_count=$(ls -1 *.zip 2>/dev/null | wc -l)

if [ "$zip_count" -eq 0 ]; then
  echo "No zip files found in $SNAPSHOTS_DIR"
  exit 0
fi

echo "Found $zip_count zip file(s) to extract..."

# Unzip each file
for zipfile in *.zip; do
  if [ -f "$zipfile" ]; then
    # Get filename without extension
    dirname="${zipfile%.zip}"

    echo "Extracting $zipfile to $dirname/"

    # Create directory and extract
    mkdir -p "$dirname"
    unzip -q -o "$zipfile" -d "$dirname"

    echo "✓ Extracted $zipfile"
  fi
done

echo "Done! All zip files extracted."

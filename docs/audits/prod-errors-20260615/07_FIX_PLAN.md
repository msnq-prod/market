# Fix Plan

1. Photo Tool legacy apply
   - Add dedicated route upload limit for larger batches.
   - Convert Multer limit errors into 400 responses with a clear Russian message.
   - Add regression coverage for oversized file count handling.

2. Video Tool v3
   - Remove legacy fallback from Electron server client.
   - Add unit coverage that v3 404 does not call legacy route.

3. Clone
   - No code change without reproducible backend evidence.

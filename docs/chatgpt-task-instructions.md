# Example instructions for a recurring task

Add this block to the existing translation task. Keep its schedule, HTML preparation rules and exclusion list. Replace `https://paperword.example.com` with your APP_ORIGIN; never commit personal chat identifiers or schedule details.

MCP connection and cloud uploads require a deployed VPS and owner OAuth approval.

```text
UPLOAD TO MY PERSONAL PAPERWORD LIBRARY:
After preparing and validating the single finished HTML, save that same file to my Paperword service: https://paperword.example.com. Use the connected Paperword MCP app and import_chatgpt_file. Pass a real ChatGPT file object (file_id and download_url; file_name and mime_type if available), rather than a /mnt/data path or invented link. Use a stable external_id: DOI or arXiv ID + version + :bilingual-black. Include the article title, primary research-source URL and topic tags. Do not send the complete HTML as tool text when file transfer is available.
Check the receipt: id, translated_blocks, duplicate and reader_url. Only report the article as added after a successful response; place its Paperword reading link beside the existing single “Download — dark theme” link. If needed, verify through get_imported_article. A retry after network failure must use the same external_id and finished file. Never overwrite an existing article on conflict.
If the MCP app is disconnected, the service is unavailable, reauthorization is needed or write confirmation is pending, preserve the finished HTML as before and briefly report why automatic upload did not finish. Do not create another automation, change the schedule or report an attempted upload as success. Never request Paperword passwords or tokens in chat text.
```

After VPS deployment, create a ChatGPT app with MCP URL `https://paperword.example.com/mcp`, OAuth and dynamic client registration (leave client ID/secret empty if the interface offers DCR). Custom-app and scheduled-invocation availability depends on the plan and workspace settings. The owner completes initial sign-in and OAuth consent; ChatGPT controls write confirmations. After connecting, test one manual run of the existing task. Cloud execution remains unverified until then.

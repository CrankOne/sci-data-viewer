// Triggers a browser download of in-memory content -- the Blob/temp-<a>/
// revoke pattern that used to live only inline in
// components/modals/SessionPickerModal.vue's own JSON session export
// (export_to_file); pulled out once modules/table/'s CSV export needed the
// identical mechanism rather than a second inline copy.
export function download_blob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function download_text(text, filename, mimeType = 'text/plain') {
    download_blob(new Blob([text], {type: mimeType}), filename);
}

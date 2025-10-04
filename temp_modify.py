from pathlib import Path
path = Path('frontend/app.js')
text = path.read_text(encoding='utf-8')
old_socket_line = "    const socket = io(window.location.origin);\n"
if old_socket_line not in text:
    raise SystemExit('Target socket initialization not found')
new_block = """    const FALLBACK_BACKEND_PORT = 3000;\n\n    // Resolve backend URL so the dashboard works inside VS Code preview/live share contexts.\n    const resolveBackendBaseUrl = () => {\n        const params = new URLSearchParams(window.location.search);\n        const overrideUrl = params.get('backendUrl') || localStorage.getItem('backend_url');\n        if (overrideUrl) {\n            return overrideUrl.replace(/\/+$/, '');\n        }\n        const overridePort = params.get('backendPort') || localStorage.getItem('backend_port');\n        if (overridePort) {\n            const sanitizedPort = f"{overridePort}".replace(/[^0-9]/g, '');\n            if (sanitizedPort) {\n                return `http://localhost:${sanitizedPort}`;\n            }\n        }\n\n        const isHttpLike = window.location.protocol === 'http:' || window.location.protocol === 'https:';\n        const looksLikePreview = window.location.protocol.startsWith('vscode') || window.location.hostname === '' || window.location.hostname.includes('vscode-cdn.net');\n        if (isHttpLike && !looksLikePreview) {\n            return window.location.origin;\n        }\n        return `http://localhost:${FALLBACK_BACKEND_PORT}`;\n    };\n\n    const normalizeBaseUrl = (url) => (url.endsWith('/') ? url.slice(0, -1) : url);\n    const backendBaseUrl = normalizeBaseUrl(resolveBackendBaseUrl());\n    const buildApiUrl = (path) => `${backendBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;\n    const socket = io(backendBaseUrl, { transports: ['websocket', 'polling'], path: '/socket.io' });\n"""
text = text.replace(old_socket_line, new_block + '\n', 1)
old_fetch = "            const response = await fetch('/api/system/control', {"
if old_fetch not in text:
    raise SystemExit('Target fetch call not found')
text = text.replace(old_fetch, "            const response = await fetch(buildApiUrl('/api/system/control'), {", 1)
path.write_text(text, encoding='utf-8')

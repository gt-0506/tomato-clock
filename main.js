const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 560,
    resizable: false,
    frame: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  try {
    const icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAQklEQVR42u3PAQ0AAAgDIN8/9K3hIQ4oSTQ7poF2LgKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAguGwqBATYk+DfRAAAAAElFTkSuQmCC'
    );
    tray = new Tray(icon);
  } catch (e) {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => mainWindow && mainWindow.show() },
    { label: '退出', click: () => app.quit() },
  ]);
  tray.setToolTip('番茄钟');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: 发送系统通知
ipcMain.on('notify', (event, { title, body }) => {
  new Notification({ title, body }).show();
});

// IPC: 窗口控制
ipcMain.on('minimize-window', () => mainWindow && mainWindow.minimize());
ipcMain.on('close-window', async () => {
  if (!mainWindow) return;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['最小化到托盘', '退出程序'],
    defaultId: 0,
    title: '番茄钟',
    message: '你想最小化到托盘还是退出程序？',
  });
  if (result.response === 0) {
    mainWindow.hide();
  } else {
    app.quit();
  }
});

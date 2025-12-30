/**
 * Интеграционный тест для мессенджера
 * Запуск: node backend/messenger-integration-test.cjs
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:22869';
const WS_URL = 'ws://localhost:22869/ws/messenger';

let testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

// Вспомогательная функция для HTTP запросов
function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'test-user-1',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Тестовая функция
async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    testResults.passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Ошибка: ${error.message}`);
    testResults.failed++;
    testResults.errors.push({ test: name, error: error.message });
  }
}

// Вспомогательная функция проверки
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Тесты
async function runTests() {
  console.log('\n🧪 Запуск интеграционных тестов мессенджера\n');

  // 1. Инициализация БД
  await test('Инициализация БД', async () => {
    const res = await makeRequest('GET', '/api/messenger/init-db');
    assert(res.status === 200, `Ожидалось 200, получено ${res.status}`);
    assert(res.body.success === true, 'Ответ должен содержать success: true');
  });

  // 2. Получение информации о хранилище
  let storageInfo;
  await test('Получение информации о хранилище', async () => {
    const res = await makeRequest('GET', '/api/messenger/storage-info');
    assert(res.status === 200, `Ожидалось 200, получено ${res.status}`);
    assert(res.body.success === true, 'Storage info должен быть успешным');
    assert(res.body.quota, 'Должна быть квота');
    storageInfo = res.body;
  });

  // 3. Создание разговора
  let conversationId;
  await test('Создание разговора', async () => {
    const res = await makeRequest('POST', '/api/messenger/conversation/create', {}, {
      participantIds: ['test-user-1', 'test-user-2', 'test-user-3']
    });
    assert(res.status === 200, `Ожидалось 200, получено ${res.status}`);
    assert(res.body.conversation?.id, 'Должен быть ID разговора');
    conversationId = res.body.conversation.id;
  });

  // 4. Получение разговоров пользователя
  await test('Получение разговоров пользователя', async () => {
    const res = await makeRequest('GET', '/api/messenger/conversations');
    assert(res.status === 200, `Ожидалось 200, получено ${res.status}`);
    assert(Array.isArray(res.body.conversations), 'Должен быть массив разговоров');
  });

  // 5. Получение сообщений разговора (пусто)
  await test('Получение сообщений разговора', async () => {
    const res = await makeRequest('GET', `/api/messenger/conversation/${conversationId}/messages?limit=50&offset=0`);
    assert(res.status === 200, `Ожидалось 200, получено ${res.status}`);
    assert(Array.isArray(res.body.messages), 'Должен быть массив сообщений');
    assert(res.body.messages.length === 0, 'Изначально сообщений не должно быть');
  });

  // 6. WebSocket - подключение
  await test('WebSocket подключение', async () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL, {
        headers: { 'x-user-id': 'test-user-1' }
      });

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket подключение истекло'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        resolve();
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });

  // 7. WebSocket - отправка пинга
  await test('WebSocket пинг/понг', async () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL, {
        headers: { 'x-user-id': 'test-user-1' }
      });

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket пинг истек'));
      }, 5000);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'ping' }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'pong') {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });

  // 8. WebSocket - статусы пользователей
  await test('WebSocket статусы пользователей', async () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL, {
        headers: { 'x-user-id': 'test-user-1' }
      });

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket статусы истекли'));
      }, 5000);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'get_user_status',
          data: { targetUserId: 'test-user-2' }
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'user_status') {
          assert(message.user?.id === 'test-user-2', 'ID должен совпадать');
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });

  // 9. Получение файлов пользователя (пусто)
  await test('Получение файлов пользователя', async () => {
    const res = await makeRequest('GET', '/api/messenger/user-files');
    assert(res.status === 200, `Ожидалось 200, получено ${res.status}`);
    assert(Array.isArray(res.body.files), 'Должен быть массив файлов');
  });

  // 10. Ошибка - попытка получить данные без user-id
  await test('Проверка аутентификации', async () => {
    const res = await makeRequest('GET', '/api/messenger/storage-info', { 'x-user-id': '' });
    assert(res.status === 401, `Ожидалось 401, получено ${res.status}`);
  });

  // Вывод результатов
  console.log('\n' + '='.repeat(50));
  console.log(`\n✅ Тестов пройдено: ${testResults.passed}`);
  console.log(`❌ Тестов провалено: ${testResults.failed}`);
  console.log(`\nВсего: ${testResults.passed + testResults.failed}`);

  if (testResults.errors.length > 0) {
    console.log('\n📋 Ошибки:');
    testResults.errors.forEach(err => {
      console.log(`  - ${err.test}: ${err.error}`);
    });
  }

  console.log('\n' + '='.repeat(50) + '\n');

  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Запуск тестов с проверкой подключения
async function main() {
  console.log('⏳ Проверка подключения к серверу...\n');

  // Даем серверу время на запуск
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    const res = await makeRequest('GET', '/api/messenger/init-db');
    if (res.status) {
      await runTests();
    }
  } catch (error) {
    console.error('❌ Ошибка подключения к серверу');
    console.error('Убедитесь что сервер запущен на http://localhost:22869');
    console.error(`Ошибка: ${error.message}`);
    process.exit(1);
  }
}

main();

---
title: Anova4All API v0.1.0
language_tabs:
  - shell: Shell
  - http: HTTP
  - javascript: JavaScript
  - ruby: Ruby
  - python: Python
  - php: PHP
  - java: Java
  - go: Go
toc_footers: []
includes: []
search: true
highlight_theme: darkula
headingLevel: 2

---

<!-- Generator: Widdershins v4.0.1 -->

<h1 id="anova4all-api">Anova4All API v0.1.0</h1>

> Scroll down for code samples, example requests and responses. Select a language for code samples from the tabs above or the mobile navigation menu.

This API provides endpoints for controlling Anova Precision Cooker devices over WiFi.
Using this API, you can start and stop cooking sessions, set the target temperature, and more.

## Setup
To get started, you'll need to setup your device using Bluetooth:
    1. Your device must be connected to the power outlet, and within a close range of your device to be set up
        with Bluetooth. 
    2. Set up a new `secret_key`, using the `POST /api/ble/new_secret_key` endpoint.
    3. Redirect your device to the Anova API server, using the `POST /api/ble/config_wifi_server` endpoint.
    4. Connect your device to the WiFi network, using the `POST /api/ble/connect_wifi` endpoint.
    
## Authentication
Most endpoints require authentication using a `secret_key`. You can provide the `secret_key` as a query parameter
or as a Bearer token in the `Authorization` header.

To obtain a `secret_key`, you can use the `POST /api/ble/new_secret_key` endpoint. Notice that the `secret_key` should be
kept secret, and cannot be retrieved from the device once set.

## Server-Sent Events
The Anova API provides a server-sent event stream, which can be used to monitor device state changes and events.
To subscribe to the event stream, you can use the `/api/devices/{device_id}/sse` endpoint.

# Authentication

* API Key (APIKeyQuery)
    - Parameter Name: **secret_key**, in: query. Secret key for device authentication

- HTTP Authentication, scheme: bearer Bearer token for device authentication

<h1 id="anova4all-api-default">Default</h1>

## get_devices_api_devices_get

<a id="opIdget_devices_api_devices_get"></a>

> Code samples

```shell
# You can also use wget
curl -X GET /api/devices \
  -H 'Accept: application/json'

```

```http
GET /api/devices HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/devices',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.get '/api/devices',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.get('/api/devices', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('GET','/api/devices', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("GET");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("GET", "/api/devices", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`GET /api/devices`

*Get Devices*

Get a list of devices connected to the server

> Example responses

> 200 Response

```json
[
  {
    "id": "string",
    "version": "string",
    "device_number": "string"
  }
]
```

<h3 id="get_devices_api_devices_get-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|Inline|

<h3 id="get_devices_api_devices_get-responseschema">Response Schema</h3>

Status Code **200**

*Response Get Devices Api Devices Get*

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|Response Get Devices Api Devices Get|[[DeviceInfo](#schemadeviceinfo)]|false|none|none|
|» DeviceInfo|[DeviceInfo](#schemadeviceinfo)|false|none|none|
|»» id|string|true|none|none|
|»» version|any|true|none|none|

*anyOf*

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|»»» *anonymous*|string|false|none|none|

*or*

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|»»» *anonymous*|null|false|none|none|

*continued*

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|»» device_number|any|true|none|none|

*anyOf*

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|»»» *anonymous*|string|false|none|none|

*or*

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|»»» *anonymous*|null|false|none|none|

<aside class="success">
This operation does not require authentication
</aside>

## get_device_state_api_devices__device_id__state_get

<a id="opIdget_device_state_api_devices__device_id__state_get"></a>

> Code samples

```shell
# You can also use wget
curl -X GET /api/devices/{device_id}/state \
  -H 'Accept: application/json'

```

```http
GET /api/devices/{device_id}/state HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/state',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.get '/api/devices/{device_id}/state',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.get('/api/devices/{device_id}/state', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('GET','/api/devices/{device_id}/state', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/state");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("GET");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("GET", "/api/devices/{device_id}/state", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`GET /api/devices/{device_id}/state`

*Get Device State*

Get the state of the device

<h3 id="get_device_state_api_devices__device_id__state_get-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|

> Example responses

> 200 Response

```json
{
  "status": "running",
  "current_temperature": 0,
  "target_temperature": 0,
  "timer_running": false,
  "timer_value": 0,
  "unit": "c",
  "speaker_status": false
}
```

<h3 id="get_device_state_api_devices__device_id__state_get-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|[DeviceState](#schemadevicestate)|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## set_temperature_api_devices__device_id__target_temperature_post

<a id="opIdset_temperature_api_devices__device_id__target_temperature_post"></a>

> Code samples

```shell
# You can also use wget
curl -X POST /api/devices/{device_id}/target_temperature \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json'

```

```http
POST /api/devices/{device_id}/target_temperature HTTP/1.1

Content-Type: application/json
Accept: application/json

```

```javascript
const inputBody = '{
  "temperature": 0
}';
const headers = {
  'Content-Type':'application/json',
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/target_temperature',
{
  method: 'POST',
  body: inputBody,
  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Content-Type' => 'application/json',
  'Accept' => 'application/json'
}

result = RestClient.post '/api/devices/{device_id}/target_temperature',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json'
}

r = requests.post('/api/devices/{device_id}/target_temperature', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Content-Type' => 'application/json',
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('POST','/api/devices/{device_id}/target_temperature', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/target_temperature");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("POST");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Content-Type": []string{"application/json"},
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("POST", "/api/devices/{device_id}/target_temperature", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`POST /api/devices/{device_id}/target_temperature`

*Set Temperature*

Set the target temperature of the device

> Body parameter

```json
{
  "temperature": 0
}
```

<h3 id="set_temperature_api_devices__device_id__target_temperature_post-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|
|body|body|[Body_set_temperature_api_devices__device_id__target_temperature_post](#schemabody_set_temperature_api_devices__device_id__target_temperature_post)|true|none|

> Example responses

> 200 Response

```json
{
  "changed_to": 0
}
```

<h3 id="set_temperature_api_devices__device_id__target_temperature_post-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|[SetTemperatureResponse](#schemasettemperatureresponse)|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## get_target_temperature_api_devices__device_id__target_temperature_get

<a id="opIdget_target_temperature_api_devices__device_id__target_temperature_get"></a>

> Code samples

```shell
# You can also use wget
curl -X GET /api/devices/{device_id}/target_temperature \
  -H 'Accept: application/json'

```

```http
GET /api/devices/{device_id}/target_temperature HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/target_temperature',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.get '/api/devices/{device_id}/target_temperature',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.get('/api/devices/{device_id}/target_temperature', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('GET','/api/devices/{device_id}/target_temperature', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/target_temperature");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("GET");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("GET", "/api/devices/{device_id}/target_temperature", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`GET /api/devices/{device_id}/target_temperature`

*Get Target Temperature*

Get the target temperature of the device

<h3 id="get_target_temperature_api_devices__device_id__target_temperature_get-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|
|from_state|query|boolean|false|none|

> Example responses

> 200 Response

```json
{
  "temperature": 0
}
```

<h3 id="get_target_temperature_api_devices__device_id__target_temperature_get-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|[GetTargetTemperatureResponse](#schemagettargettemperatureresponse)|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## start_cooking_api_devices__device_id__start_post

<a id="opIdstart_cooking_api_devices__device_id__start_post"></a>

> Code samples

```shell
# You can also use wget
curl -X POST /api/devices/{device_id}/start \
  -H 'Accept: application/json'

```

```http
POST /api/devices/{device_id}/start HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/start',
{
  method: 'POST',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.post '/api/devices/{device_id}/start',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.post('/api/devices/{device_id}/start', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('POST','/api/devices/{device_id}/start', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/start");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("POST");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("POST", "/api/devices/{device_id}/start", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`POST /api/devices/{device_id}/start`

*Start Cooking*

Start the device cooking

<h3 id="start_cooking_api_devices__device_id__start_post-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|

> Example responses

> 200 Response

```json
"ok"
```

<h3 id="start_cooking_api_devices__device_id__start_post-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|string|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## stop_cooking_api_devices__device_id__stop_post

<a id="opIdstop_cooking_api_devices__device_id__stop_post"></a>

> Code samples

```shell
# You can also use wget
curl -X POST /api/devices/{device_id}/stop \
  -H 'Accept: application/json'

```

```http
POST /api/devices/{device_id}/stop HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/stop',
{
  method: 'POST',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.post '/api/devices/{device_id}/stop',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.post('/api/devices/{device_id}/stop', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('POST','/api/devices/{device_id}/stop', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/stop");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("POST");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("POST", "/api/devices/{device_id}/stop", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`POST /api/devices/{device_id}/stop`

*Stop Cooking*

Stop the device from cooking

<h3 id="stop_cooking_api_devices__device_id__stop_post-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|

> Example responses

> 200 Response

```json
"ok"
```

<h3 id="stop_cooking_api_devices__device_id__stop_post-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|string|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## set_timer_api_devices__device_id__timer_post

<a id="opIdset_timer_api_devices__device_id__timer_post"></a>

> Code samples

```shell
# You can also use wget
curl -X POST /api/devices/{device_id}/timer \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json'

```

```http
POST /api/devices/{device_id}/timer HTTP/1.1

Content-Type: application/json
Accept: application/json

```

```javascript
const inputBody = '{
  "minutes": 0
}';
const headers = {
  'Content-Type':'application/json',
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/timer',
{
  method: 'POST',
  body: inputBody,
  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Content-Type' => 'application/json',
  'Accept' => 'application/json'
}

result = RestClient.post '/api/devices/{device_id}/timer',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json'
}

r = requests.post('/api/devices/{device_id}/timer', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Content-Type' => 'application/json',
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('POST','/api/devices/{device_id}/timer', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/timer");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("POST");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Content-Type": []string{"application/json"},
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("POST", "/api/devices/{device_id}/timer", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`POST /api/devices/{device_id}/timer`

*Set Timer*

Set the timer on the device

> Body parameter

```json
{
  "minutes": 0
}
```

<h3 id="set_timer_api_devices__device_id__timer_post-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|
|body|body|[Body_set_timer_api_devices__device_id__timer_post](#schemabody_set_timer_api_devices__device_id__timer_post)|true|none|

> Example responses

> 200 Response

```json
{
  "message": "string",
  "minutes": 0
}
```

<h3 id="set_timer_api_devices__device_id__timer_post-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|[SetTimerResponse](#schemasettimerresponse)|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## get_timer_api_devices__device_id__timer_get

<a id="opIdget_timer_api_devices__device_id__timer_get"></a>

> Code samples

```shell
# You can also use wget
curl -X GET /api/devices/{device_id}/timer \
  -H 'Accept: application/json'

```

```http
GET /api/devices/{device_id}/timer HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/timer',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.get '/api/devices/{device_id}/timer',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.get('/api/devices/{device_id}/timer', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('GET','/api/devices/{device_id}/timer', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/timer");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("GET");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("GET", "/api/devices/{device_id}/timer", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`GET /api/devices/{device_id}/timer`

*Get Timer*

Get the timer value of the device

<h3 id="get_timer_api_devices__device_id__timer_get-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|
|from_state|query|boolean|false|none|

> Example responses

> 200 Response

```json
{
  "timer": 0
}
```

<h3 id="get_timer_api_devices__device_id__timer_get-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|[TimerResponse](#schematimerresponse)|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## start_timer_api_devices__device_id__timer_start_post

<a id="opIdstart_timer_api_devices__device_id__timer_start_post"></a>

> Code samples

```shell
# You can also use wget
curl -X POST /api/devices/{device_id}/timer/start \
  -H 'Accept: application/json'

```

```http
POST /api/devices/{device_id}/timer/start HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/timer/start',
{
  method: 'POST',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.post '/api/devices/{device_id}/timer/start',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.post('/api/devices/{device_id}/timer/start', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('POST','/api/devices/{device_id}/timer/start', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/timer/start");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("POST");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("POST", "/api/devices/{device_id}/timer/start", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`POST /api/devices/{device_id}/timer/start`

*Start Timer*

Start the timer on the device

<h3 id="start_timer_api_devices__device_id__timer_start_post-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|

> Example responses

> 200 Response

```json
"ok"
```

<h3 id="start_timer_api_devices__device_id__timer_start_post-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|string|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## stop_timer_api_devices__device_id__timer_stop_post

<a id="opIdstop_timer_api_devices__device_id__timer_stop_post"></a>

> Code samples

```shell
# You can also use wget
curl -X POST /api/devices/{device_id}/timer/stop \
  -H 'Accept: application/json'

```

```http
POST /api/devices/{device_id}/timer/stop HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/timer/stop',
{
  method: 'POST',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.post '/api/devices/{device_id}/timer/stop',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.post('/api/devices/{device_id}/timer/stop', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('POST','/api/devices/{device_id}/timer/stop', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/timer/stop");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("POST");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("POST", "/api/devices/{device_id}/timer/stop", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`POST /api/devices/{device_id}/timer/stop`

*Stop Timer*

Stop the timer on the device

<h3 id="stop_timer_api_devices__device_id__timer_stop_post-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|

> Example responses

> 200 Response

```json
"ok"
```

<h3 id="stop_timer_api_devices__device_id__timer_stop_post-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|string|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## clear_alarm_api_devices__device_id__alarm_clear_post

<a id="opIdclear_alarm_api_devices__device_id__alarm_clear_post"></a>

> Code samples

```shell
# You can also use wget
curl -X POST /api/devices/{device_id}/alarm/clear \
  -H 'Accept: application/json'

```

```http
POST /api/devices/{device_id}/alarm/clear HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/alarm/clear',
{
  method: 'POST',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.post '/api/devices/{device_id}/alarm/clear',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.post('/api/devices/{device_id}/alarm/clear', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('POST','/api/devices/{device_id}/alarm/clear', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/alarm/clear");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("POST");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("POST", "/api/devices/{device_id}/alarm/clear", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`POST /api/devices/{device_id}/alarm/clear`

*Clear Alarm*

Clear the alarm on the device

<h3 id="clear_alarm_api_devices__device_id__alarm_clear_post-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|

> Example responses

> 200 Response

```json
"ok"
```

<h3 id="clear_alarm_api_devices__device_id__alarm_clear_post-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|string|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## get_temperature_api_devices__device_id__temperature_get

<a id="opIdget_temperature_api_devices__device_id__temperature_get"></a>

> Code samples

```shell
# You can also use wget
curl -X GET /api/devices/{device_id}/temperature \
  -H 'Accept: application/json'

```

```http
GET /api/devices/{device_id}/temperature HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/temperature',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.get '/api/devices/{device_id}/temperature',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.get('/api/devices/{device_id}/temperature', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('GET','/api/devices/{device_id}/temperature', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/temperature");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("GET");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("GET", "/api/devices/{device_id}/temperature", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`GET /api/devices/{device_id}/temperature`

*Get Temperature*

Get the current temperature of the device

<h3 id="get_temperature_api_devices__device_id__temperature_get-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|
|from_state|query|boolean|false|none|

> Example responses

> 200 Response

```json
{
  "temperature": 0
}
```

<h3 id="get_temperature_api_devices__device_id__temperature_get-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|[TemperatureResponse](#schematemperatureresponse)|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## get_unit_api_devices__device_id__unit_get

<a id="opIdget_unit_api_devices__device_id__unit_get"></a>

> Code samples

```shell
# You can also use wget
curl -X GET /api/devices/{device_id}/unit \
  -H 'Accept: application/json'

```

```http
GET /api/devices/{device_id}/unit HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/unit',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.get '/api/devices/{device_id}/unit',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.get('/api/devices/{device_id}/unit', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('GET','/api/devices/{device_id}/unit', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/unit");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("GET");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("GET", "/api/devices/{device_id}/unit", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`GET /api/devices/{device_id}/unit`

*Get Unit*

Get the temperature unit of the device - either Celsius(c) or Fahrenheit(f)

<h3 id="get_unit_api_devices__device_id__unit_get-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|
|from_state|query|boolean|false|none|

> Example responses

> 200 Response

```json
{
  "unit": "c"
}
```

<h3 id="get_unit_api_devices__device_id__unit_get-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|[UnitResponse](#schemaunitresponse)|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## set_unit_api_devices__device_id__unit_post

<a id="opIdset_unit_api_devices__device_id__unit_post"></a>

> Code samples

```shell
# You can also use wget
curl -X POST /api/devices/{device_id}/unit \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json'

```

```http
POST /api/devices/{device_id}/unit HTTP/1.1

Content-Type: application/json
Accept: application/json

```

```javascript
const inputBody = '{
  "unit": "c"
}';
const headers = {
  'Content-Type':'application/json',
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/unit',
{
  method: 'POST',
  body: inputBody,
  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Content-Type' => 'application/json',
  'Accept' => 'application/json'
}

result = RestClient.post '/api/devices/{device_id}/unit',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json'
}

r = requests.post('/api/devices/{device_id}/unit', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Content-Type' => 'application/json',
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('POST','/api/devices/{device_id}/unit', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/unit");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("POST");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Content-Type": []string{"application/json"},
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("POST", "/api/devices/{device_id}/unit", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`POST /api/devices/{device_id}/unit`

*Set Unit*

Set the temperature unit of the device

> Body parameter

```json
{
  "unit": "c"
}
```

<h3 id="set_unit_api_devices__device_id__unit_post-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|
|body|body|[Body_set_unit_api_devices__device_id__unit_post](#schemabody_set_unit_api_devices__device_id__unit_post)|true|none|

> Example responses

> 200 Response

```json
"ok"
```

<h3 id="set_unit_api_devices__device_id__unit_post-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|string|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## get_speaker_status_api_devices__device_id__speaker_status_get

<a id="opIdget_speaker_status_api_devices__device_id__speaker_status_get"></a>

> Code samples

```shell
# You can also use wget
curl -X GET /api/devices/{device_id}/speaker_status \
  -H 'Accept: application/json'

```

```http
GET /api/devices/{device_id}/speaker_status HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/speaker_status',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.get '/api/devices/{device_id}/speaker_status',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.get('/api/devices/{device_id}/speaker_status', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('GET','/api/devices/{device_id}/speaker_status', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/speaker_status");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("GET");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("GET", "/api/devices/{device_id}/speaker_status", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`GET /api/devices/{device_id}/speaker_status`

*Get Speaker Status*

Get the speaker status of the device

<h3 id="get_speaker_status_api_devices__device_id__speaker_status_get-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|
|from_state|query|boolean|false|none|

> Example responses

> 200 Response

```json
{
  "speaker_status": true
}
```

<h3 id="get_speaker_status_api_devices__device_id__speaker_status_get-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|[SpeakerStatusResponse](#schemaspeakerstatusresponse)|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## sse_endpoint_api_devices__device_id__sse_get

<a id="opIdsse_endpoint_api_devices__device_id__sse_get"></a>

> Code samples

```shell
# You can also use wget
curl -X GET /api/devices/{device_id}/sse \
  -H 'Accept: application/json'

```

```http
GET /api/devices/{device_id}/sse HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/devices/{device_id}/sse',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.get '/api/devices/{device_id}/sse',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.get('/api/devices/{device_id}/sse', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('GET','/api/devices/{device_id}/sse', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/devices/{device_id}/sse");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("GET");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("GET", "/api/devices/{device_id}/sse", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`GET /api/devices/{device_id}/sse`

*Sse Endpoint*

Server-Sent Events route that listens for events from a specific device.

<h3 id="sse_endpoint_api_devices__device_id__sse_get-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|device_id|path|string|true|none|

> Example responses

> 422 Response

```json
{
  "detail": [
    {
      "loc": [
        "string"
      ],
      "msg": "string",
      "type": "string"
    }
  ]
}
```

<h3 id="sse_endpoint_api_devices__device_id__sse_get-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|None|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
APIKeyQuery, HTTPBearer
</aside>

## get_server_info_api_server_info_get

<a id="opIdget_server_info_api_server_info_get"></a>

> Code samples

```shell
# You can also use wget
curl -X GET /api/server_info \
  -H 'Accept: application/json'

```

```http
GET /api/server_info HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/server_info',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.get '/api/server_info',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.get('/api/server_info', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('GET','/api/server_info', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/server_info");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("GET");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("GET", "/api/server_info", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`GET /api/server_info`

*Get Server Info*

Get the server info

> Example responses

> 200 Response

```json
{
  "host": "string",
  "port": 0
}
```

<h3 id="get_server_info_api_server_info_get-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|[ServerInfo](#schemaserverinfo)|

<aside class="success">
This operation does not require authentication
</aside>

## get_ble_device_api_ble_device_get

<a id="opIdget_ble_device_api_ble_device_get"></a>

> Code samples

```shell
# You can also use wget
curl -X GET /api/ble/device \
  -H 'Accept: application/json'

```

```http
GET /api/ble/device HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/ble/device',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.get '/api/ble/device',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.get('/api/ble/device', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('GET','/api/ble/device', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/ble/device");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("GET");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("GET", "/api/ble/device", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`GET /api/ble/device`

*Get Ble Device*

Get the BLE device

> Example responses

> 200 Response

```json
{
  "address": "string",
  "name": "string"
}
```

<h3 id="get_ble_device_api_ble_device_get-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|[BLEDevice](#schemabledevice)|

<aside class="success">
This operation does not require authentication
</aside>

## ble_connect_wifi_api_ble_connect_wifi_post

<a id="opIdble_connect_wifi_api_ble_connect_wifi_post"></a>

> Code samples

```shell
# You can also use wget
curl -X POST /api/ble/connect_wifi \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json'

```

```http
POST /api/ble/connect_wifi HTTP/1.1

Content-Type: application/json
Accept: application/json

```

```javascript
const inputBody = '{
  "ssid": "string",
  "password": "string"
}';
const headers = {
  'Content-Type':'application/json',
  'Accept':'application/json'
};

fetch('/api/ble/connect_wifi',
{
  method: 'POST',
  body: inputBody,
  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Content-Type' => 'application/json',
  'Accept' => 'application/json'
}

result = RestClient.post '/api/ble/connect_wifi',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json'
}

r = requests.post('/api/ble/connect_wifi', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Content-Type' => 'application/json',
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('POST','/api/ble/connect_wifi', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/ble/connect_wifi");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("POST");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Content-Type": []string{"application/json"},
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("POST", "/api/ble/connect_wifi", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`POST /api/ble/connect_wifi`

*Ble Connect Wifi*

Connect the Anova Precision Cooker to a Wi-Fi network

> Body parameter

```json
{
  "ssid": "string",
  "password": "string"
}
```

<h3 id="ble_connect_wifi_api_ble_connect_wifi_post-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|body|body|[Body_ble_connect_wifi_api_ble_connect_wifi_post](#schemabody_ble_connect_wifi_api_ble_connect_wifi_post)|true|none|

> Example responses

> 200 Response

```json
"ok"
```

<h3 id="ble_connect_wifi_api_ble_connect_wifi_post-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|string|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="success">
This operation does not require authentication
</aside>

## patch_ble_device_api_ble_config_wifi_server_post

<a id="opIdpatch_ble_device_api_ble_config_wifi_server_post"></a>

> Code samples

```shell
# You can also use wget
curl -X POST /api/ble/config_wifi_server \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json'

```

```http
POST /api/ble/config_wifi_server HTTP/1.1

Content-Type: application/json
Accept: application/json

```

```javascript
const inputBody = '{
  "host": "string",
  "port": 0
}';
const headers = {
  'Content-Type':'application/json',
  'Accept':'application/json'
};

fetch('/api/ble/config_wifi_server',
{
  method: 'POST',
  body: inputBody,
  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Content-Type' => 'application/json',
  'Accept' => 'application/json'
}

result = RestClient.post '/api/ble/config_wifi_server',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json'
}

r = requests.post('/api/ble/config_wifi_server', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Content-Type' => 'application/json',
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('POST','/api/ble/config_wifi_server', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/ble/config_wifi_server");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("POST");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Content-Type": []string{"application/json"},
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("POST", "/api/ble/config_wifi_server", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`POST /api/ble/config_wifi_server`

*Patch Ble Device*

Patch the Anova Precision Cooker to communicate with our server

> Body parameter

```json
{
  "host": "string",
  "port": 0
}
```

<h3 id="patch_ble_device_api_ble_config_wifi_server_post-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|body|body|[Body_patch_ble_device_api_ble_config_wifi_server_post](#schemabody_patch_ble_device_api_ble_config_wifi_server_post)|false|none|

> Example responses

> 200 Response

```json
"ok"
```

<h3 id="patch_ble_device_api_ble_config_wifi_server_post-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|string|
|422|[Unprocessable Entity](https://tools.ietf.org/html/rfc2518#section-10.3)|Validation Error|[HTTPValidationError](#schemahttpvalidationerror)|

<aside class="success">
This operation does not require authentication
</aside>

## restore_ble_device_api_ble_restore_wifi_server_post

<a id="opIdrestore_ble_device_api_ble_restore_wifi_server_post"></a>

> Code samples

```shell
# You can also use wget
curl -X POST /api/ble/restore_wifi_server \
  -H 'Accept: application/json'

```

```http
POST /api/ble/restore_wifi_server HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/ble/restore_wifi_server',
{
  method: 'POST',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.post '/api/ble/restore_wifi_server',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.post('/api/ble/restore_wifi_server', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('POST','/api/ble/restore_wifi_server', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/ble/restore_wifi_server");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("POST");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("POST", "/api/ble/restore_wifi_server", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`POST /api/ble/restore_wifi_server`

*Restore Ble Device*

Restore the Anova Precision Cooker to communicate with the Anova Cloud server

> Example responses

> 200 Response

```json
"ok"
```

<h3 id="restore_ble_device_api_ble_restore_wifi_server_post-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|string|

<aside class="success">
This operation does not require authentication
</aside>

## ble_get_info_api_ble__get

<a id="opIdble_get_info_api_ble__get"></a>

> Code samples

```shell
# You can also use wget
curl -X GET /api/ble/ \
  -H 'Accept: application/json'

```

```http
GET /api/ble/ HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/ble/',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.get '/api/ble/',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.get('/api/ble/', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('GET','/api/ble/', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/ble/");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("GET");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("GET", "/api/ble/", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`GET /api/ble/`

*Ble Get Info*

Get the number on the Anova Precision Cooker

> Example responses

> 200 Response

```json
{
  "ble_address": "string",
  "ble_name": "string",
  "version": "string",
  "id_card": "string",
  "temperature_unit": "c",
  "speaker_status": true
}
```

<h3 id="ble_get_info_api_ble__get-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|[BLEDeviceInfo](#schemabledeviceinfo)|

<aside class="success">
This operation does not require authentication
</aside>

## ble_new_secret_key_api_ble_secret_key_post

<a id="opIdble_new_secret_key_api_ble_secret_key_post"></a>

> Code samples

```shell
# You can also use wget
curl -X POST /api/ble/secret_key \
  -H 'Accept: application/json'

```

```http
POST /api/ble/secret_key HTTP/1.1

Accept: application/json

```

```javascript

const headers = {
  'Accept':'application/json'
};

fetch('/api/ble/secret_key',
{
  method: 'POST',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

```ruby
require 'rest-client'
require 'json'

headers = {
  'Accept' => 'application/json'
}

result = RestClient.post '/api/ble/secret_key',
  params: {
  }, headers: headers

p JSON.parse(result)

```

```python
import requests
headers = {
  'Accept': 'application/json'
}

r = requests.post('/api/ble/secret_key', headers = headers)

print(r.json())

```

```php
<?php

require 'vendor/autoload.php';

$headers = array(
    'Accept' => 'application/json',
);

$client = new \GuzzleHttp\Client();

// Define array of request body.
$request_body = array();

try {
    $response = $client->request('POST','/api/ble/secret_key', array(
        'headers' => $headers,
        'json' => $request_body,
       )
    );
    print_r($response->getBody()->getContents());
 }
 catch (\GuzzleHttp\Exception\BadResponseException $e) {
    // handle exception or api errors.
    print_r($e->getMessage());
 }

 // ...

```

```java
URL obj = new URL("/api/ble/secret_key");
HttpURLConnection con = (HttpURLConnection) obj.openConnection();
con.setRequestMethod("POST");
int responseCode = con.getResponseCode();
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
String inputLine;
StringBuffer response = new StringBuffer();
while ((inputLine = in.readLine()) != null) {
    response.append(inputLine);
}
in.close();
System.out.println(response.toString());

```

```go
package main

import (
       "bytes"
       "net/http"
)

func main() {

    headers := map[string][]string{
        "Accept": []string{"application/json"},
    }

    data := bytes.NewBuffer([]byte{jsonReq})
    req, err := http.NewRequest("POST", "/api/ble/secret_key", data)
    req.Header = headers

    client := &http.Client{}
    resp, err := client.Do(req)
    // ...
}

```

`POST /api/ble/secret_key`

*Ble New Secret Key*

Set a new secret key on the Anova Precision Cooker

> Example responses

> 200 Response

```json
{
  "secret_key": "string"
}
```

<h3 id="ble_new_secret_key_api_ble_secret_key_post-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful Response|[NewSecretResponse](#schemanewsecretresponse)|

<aside class="success">
This operation does not require authentication
</aside>

# Schemas

<h2 id="tocS_AnovaEvent">AnovaEvent</h2>
<!-- backwards compatibility -->
<a id="schemaanovaevent"></a>
<a id="schema_AnovaEvent"></a>
<a id="tocSanovaevent"></a>
<a id="tocsanovaevent"></a>

```yaml
type: temp_reached
originator: wifi

```

AnovaEvent

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|type|[EventType](#schemaeventtype)|true|none|none|
|originator|[EventOriginator](#schemaeventoriginator)|false|none|none|

<h2 id="tocS_BLEDevice">BLEDevice</h2>
<!-- backwards compatibility -->
<a id="schemabledevice"></a>
<a id="schema_BLEDevice"></a>
<a id="tocSbledevice"></a>
<a id="tocsbledevice"></a>

```yaml
address: string
name: string

```

BLEDevice

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|address|string|true|none|none|
|name|string|true|none|none|

<h2 id="tocS_BLEDeviceInfo">BLEDeviceInfo</h2>
<!-- backwards compatibility -->
<a id="schemabledeviceinfo"></a>
<a id="schema_BLEDeviceInfo"></a>
<a id="tocSbledeviceinfo"></a>
<a id="tocsbledeviceinfo"></a>

```yaml
ble_address: string
ble_name: string
version: string
id_card: string
temperature_unit: c
speaker_status: true

```

BLEDeviceInfo

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|ble_address|string|true|none|none|
|ble_name|string|true|none|none|
|version|string|true|none|none|
|id_card|string|true|none|none|
|temperature_unit|[TemperatureUnit](#schematemperatureunit)|true|none|none|
|speaker_status|boolean|true|none|none|

<h2 id="tocS_Body_ble_connect_wifi_api_ble_connect_wifi_post">Body_ble_connect_wifi_api_ble_connect_wifi_post</h2>
<!-- backwards compatibility -->
<a id="schemabody_ble_connect_wifi_api_ble_connect_wifi_post"></a>
<a id="schema_Body_ble_connect_wifi_api_ble_connect_wifi_post"></a>
<a id="tocSbody_ble_connect_wifi_api_ble_connect_wifi_post"></a>
<a id="tocsbody_ble_connect_wifi_api_ble_connect_wifi_post"></a>

```yaml
ssid: string
password: string

```

Body_ble_connect_wifi_api_ble_connect_wifi_post

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|ssid|string|true|none|none|
|password|string|true|none|none|

<h2 id="tocS_Body_patch_ble_device_api_ble_config_wifi_server_post">Body_patch_ble_device_api_ble_config_wifi_server_post</h2>
<!-- backwards compatibility -->
<a id="schemabody_patch_ble_device_api_ble_config_wifi_server_post"></a>
<a id="schema_Body_patch_ble_device_api_ble_config_wifi_server_post"></a>
<a id="tocSbody_patch_ble_device_api_ble_config_wifi_server_post"></a>
<a id="tocsbody_patch_ble_device_api_ble_config_wifi_server_post"></a>

```yaml
host: string
port: 0

```

Body_patch_ble_device_api_ble_config_wifi_server_post

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|host|any|false|none|The IP address of the server.If not provided, the local IP address will be determined automatically|

anyOf

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|string|false|none|none|

or

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|null|false|none|none|

continued

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|port|any|false|none|The port of the server. If not provided, port of the server will be used|

anyOf

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|integer|false|none|none|

or

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|null|false|none|none|

<h2 id="tocS_Body_set_temperature_api_devices__device_id__target_temperature_post">Body_set_temperature_api_devices__device_id__target_temperature_post</h2>
<!-- backwards compatibility -->
<a id="schemabody_set_temperature_api_devices__device_id__target_temperature_post"></a>
<a id="schema_Body_set_temperature_api_devices__device_id__target_temperature_post"></a>
<a id="tocSbody_set_temperature_api_devices__device_id__target_temperature_post"></a>
<a id="tocsbody_set_temperature_api_devices__device_id__target_temperature_post"></a>

```yaml
temperature: 0

```

Body_set_temperature_api_devices__device_id__target_temperature_post

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|temperature|number|true|none|none|

<h2 id="tocS_Body_set_timer_api_devices__device_id__timer_post">Body_set_timer_api_devices__device_id__timer_post</h2>
<!-- backwards compatibility -->
<a id="schemabody_set_timer_api_devices__device_id__timer_post"></a>
<a id="schema_Body_set_timer_api_devices__device_id__timer_post"></a>
<a id="tocSbody_set_timer_api_devices__device_id__timer_post"></a>
<a id="tocsbody_set_timer_api_devices__device_id__timer_post"></a>

```yaml
minutes: 0

```

Body_set_timer_api_devices__device_id__timer_post

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|minutes|integer|true|none|none|

<h2 id="tocS_Body_set_unit_api_devices__device_id__unit_post">Body_set_unit_api_devices__device_id__unit_post</h2>
<!-- backwards compatibility -->
<a id="schemabody_set_unit_api_devices__device_id__unit_post"></a>
<a id="schema_Body_set_unit_api_devices__device_id__unit_post"></a>
<a id="tocSbody_set_unit_api_devices__device_id__unit_post"></a>
<a id="tocsbody_set_unit_api_devices__device_id__unit_post"></a>

```yaml
unit: c

```

Body_set_unit_api_devices__device_id__unit_post

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|unit|[TemperatureUnit](#schematemperatureunit)|true|none|none|

<h2 id="tocS_DeviceInfo">DeviceInfo</h2>
<!-- backwards compatibility -->
<a id="schemadeviceinfo"></a>
<a id="schema_DeviceInfo"></a>
<a id="tocSdeviceinfo"></a>
<a id="tocsdeviceinfo"></a>

```yaml
id: string
version: string
device_number: string

```

DeviceInfo

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|id|string|true|none|none|
|version|any|true|none|none|

anyOf

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|string|false|none|none|

or

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|null|false|none|none|

continued

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|device_number|any|true|none|none|

anyOf

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|string|false|none|none|

or

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|null|false|none|none|

<h2 id="tocS_DeviceState">DeviceState</h2>
<!-- backwards compatibility -->
<a id="schemadevicestate"></a>
<a id="schema_DeviceState"></a>
<a id="tocSdevicestate"></a>
<a id="tocsdevicestate"></a>

```yaml
status: running
current_temperature: 0
target_temperature: 0
timer_running: false
timer_value: 0
unit: c
speaker_status: false

```

DeviceState

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|status|[DeviceStatus](#schemadevicestatus)|false|none|none|
|current_temperature|number|false|none|none|
|target_temperature|number|false|none|none|
|timer_running|boolean|false|none|none|
|timer_value|integer|false|none|none|
|unit|any|false|none|none|

anyOf

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|[TemperatureUnit](#schematemperatureunit)|false|none|none|

or

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|null|false|none|none|

continued

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|speaker_status|boolean|false|none|none|

<h2 id="tocS_DeviceStatus">DeviceStatus</h2>
<!-- backwards compatibility -->
<a id="schemadevicestatus"></a>
<a id="schema_DeviceStatus"></a>
<a id="tocSdevicestatus"></a>
<a id="tocsdevicestatus"></a>

```yaml
running

```

DeviceStatus

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|DeviceStatus|string|false|none|none|

#### Enumerated Values

|Property|Value|
|---|---|
|DeviceStatus|running|
|DeviceStatus|stopped|
|DeviceStatus|low water|
|DeviceStatus|heater error|
|DeviceStatus|power loss|
|DeviceStatus|user change parameter|

<h2 id="tocS_EventOriginator">EventOriginator</h2>
<!-- backwards compatibility -->
<a id="schemaeventoriginator"></a>
<a id="schema_EventOriginator"></a>
<a id="tocSeventoriginator"></a>
<a id="tocseventoriginator"></a>

```yaml
wifi

```

EventOriginator

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|EventOriginator|string|false|none|none|

#### Enumerated Values

|Property|Value|
|---|---|
|EventOriginator|wifi|
|EventOriginator|ble|
|EventOriginator|device|

<h2 id="tocS_EventType">EventType</h2>
<!-- backwards compatibility -->
<a id="schemaeventtype"></a>
<a id="schema_EventType"></a>
<a id="tocSeventtype"></a>
<a id="tocseventtype"></a>

```yaml
temp_reached

```

EventType

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|EventType|string|false|none|none|

#### Enumerated Values

|Property|Value|
|---|---|
|EventType|temp_reached|
|EventType|low_water|
|EventType|start|
|EventType|stop|
|EventType|change_temp|
|EventType|time_start|
|EventType|time_stop|
|EventType|time_finish|
|EventType|change_param|

<h2 id="tocS_GetTargetTemperatureResponse">GetTargetTemperatureResponse</h2>
<!-- backwards compatibility -->
<a id="schemagettargettemperatureresponse"></a>
<a id="schema_GetTargetTemperatureResponse"></a>
<a id="tocSgettargettemperatureresponse"></a>
<a id="tocsgettargettemperatureresponse"></a>

```yaml
temperature: 0

```

GetTargetTemperatureResponse

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|temperature|number|true|none|none|

<h2 id="tocS_HTTPValidationError">HTTPValidationError</h2>
<!-- backwards compatibility -->
<a id="schemahttpvalidationerror"></a>
<a id="schema_HTTPValidationError"></a>
<a id="tocShttpvalidationerror"></a>
<a id="tocshttpvalidationerror"></a>

```yaml
detail:
  - loc:
      - string
    msg: string
    type: string

```

HTTPValidationError

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|detail|[[ValidationError](#schemavalidationerror)]|false|none|none|

<h2 id="tocS_NewSecretResponse">NewSecretResponse</h2>
<!-- backwards compatibility -->
<a id="schemanewsecretresponse"></a>
<a id="schema_NewSecretResponse"></a>
<a id="tocSnewsecretresponse"></a>
<a id="tocsnewsecretresponse"></a>

```yaml
secret_key: string

```

NewSecretResponse

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|secret_key|string|true|none|none|

<h2 id="tocS_SSEEvent">SSEEvent</h2>
<!-- backwards compatibility -->
<a id="schemasseevent"></a>
<a id="schema_SSEEvent"></a>
<a id="tocSsseevent"></a>
<a id="tocssseevent"></a>

```yaml
event_type: device_connected
device_id: string
payload:
  type: temp_reached
  originator: wifi

```

SSEEvent

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|event_type|[SSEEventType](#schemasseeventtype)|true|none|none|
|device_id|any|false|none|none|

anyOf

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|string|false|none|none|

or

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|null|false|none|none|

continued

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|payload|any|false|none|none|

anyOf

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|[AnovaEvent](#schemaanovaevent)|false|none|none|

or

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|[DeviceState](#schemadevicestate)|false|none|none|

or

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|null|false|none|none|

<h2 id="tocS_SSEEventType">SSEEventType</h2>
<!-- backwards compatibility -->
<a id="schemasseeventtype"></a>
<a id="schema_SSEEventType"></a>
<a id="tocSsseeventtype"></a>
<a id="tocssseeventtype"></a>

```yaml
device_connected

```

SSEEventType

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|SSEEventType|string|false|none|none|

#### Enumerated Values

|Property|Value|
|---|---|
|SSEEventType|device_connected|
|SSEEventType|device_disconnected|
|SSEEventType|state_changed|
|SSEEventType|event|
|SSEEventType|ping|

<h2 id="tocS_ServerInfo">ServerInfo</h2>
<!-- backwards compatibility -->
<a id="schemaserverinfo"></a>
<a id="schema_ServerInfo"></a>
<a id="tocSserverinfo"></a>
<a id="tocsserverinfo"></a>

```yaml
host: string
port: 0

```

ServerInfo

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|host|string|true|none|none|
|port|integer|true|none|none|

<h2 id="tocS_SetTemperatureResponse">SetTemperatureResponse</h2>
<!-- backwards compatibility -->
<a id="schemasettemperatureresponse"></a>
<a id="schema_SetTemperatureResponse"></a>
<a id="tocSsettemperatureresponse"></a>
<a id="tocssettemperatureresponse"></a>

```yaml
changed_to: 0

```

SetTemperatureResponse

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|changed_to|number|true|none|none|

<h2 id="tocS_SetTimerResponse">SetTimerResponse</h2>
<!-- backwards compatibility -->
<a id="schemasettimerresponse"></a>
<a id="schema_SetTimerResponse"></a>
<a id="tocSsettimerresponse"></a>
<a id="tocssettimerresponse"></a>

```yaml
message: string
minutes: 0

```

SetTimerResponse

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|message|string|true|none|none|
|minutes|integer|true|none|none|

<h2 id="tocS_SpeakerStatusResponse">SpeakerStatusResponse</h2>
<!-- backwards compatibility -->
<a id="schemaspeakerstatusresponse"></a>
<a id="schema_SpeakerStatusResponse"></a>
<a id="tocSspeakerstatusresponse"></a>
<a id="tocsspeakerstatusresponse"></a>

```yaml
speaker_status: true

```

SpeakerStatusResponse

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|speaker_status|boolean|true|none|none|

<h2 id="tocS_TemperatureResponse">TemperatureResponse</h2>
<!-- backwards compatibility -->
<a id="schematemperatureresponse"></a>
<a id="schema_TemperatureResponse"></a>
<a id="tocStemperatureresponse"></a>
<a id="tocstemperatureresponse"></a>

```yaml
temperature: 0

```

TemperatureResponse

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|temperature|number|true|none|none|

<h2 id="tocS_TemperatureUnit">TemperatureUnit</h2>
<!-- backwards compatibility -->
<a id="schematemperatureunit"></a>
<a id="schema_TemperatureUnit"></a>
<a id="tocStemperatureunit"></a>
<a id="tocstemperatureunit"></a>

```yaml
c

```

TemperatureUnit

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|TemperatureUnit|string|false|none|none|

#### Enumerated Values

|Property|Value|
|---|---|
|TemperatureUnit|c|
|TemperatureUnit|f|

<h2 id="tocS_TimerResponse">TimerResponse</h2>
<!-- backwards compatibility -->
<a id="schematimerresponse"></a>
<a id="schema_TimerResponse"></a>
<a id="tocStimerresponse"></a>
<a id="tocstimerresponse"></a>

```yaml
timer: 0

```

TimerResponse

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|timer|integer|true|none|none|

<h2 id="tocS_UnitResponse">UnitResponse</h2>
<!-- backwards compatibility -->
<a id="schemaunitresponse"></a>
<a id="schema_UnitResponse"></a>
<a id="tocSunitresponse"></a>
<a id="tocsunitresponse"></a>

```yaml
unit: c

```

UnitResponse

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|unit|any|true|none|none|

anyOf

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|[TemperatureUnit](#schematemperatureunit)|false|none|none|

or

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|null|false|none|none|

<h2 id="tocS_ValidationError">ValidationError</h2>
<!-- backwards compatibility -->
<a id="schemavalidationerror"></a>
<a id="schema_ValidationError"></a>
<a id="tocSvalidationerror"></a>
<a id="tocsvalidationerror"></a>

```yaml
loc:
  - string
msg: string
type: string

```

ValidationError

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|loc|[anyOf]|true|none|none|

anyOf

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|string|false|none|none|

or

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» *anonymous*|integer|false|none|none|

continued

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|msg|string|true|none|none|
|type|string|true|none|none|


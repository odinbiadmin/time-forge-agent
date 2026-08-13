param(
  [Parameter(Mandatory = $true)][ValidateSet("connect", "metadata", "users", "attendance", "upsertUser", "deleteUser")][string]$Operation,
  [Parameter(Mandatory = $true)][string]$Ip,
  [int]$Port = 4370,
  [int]$MachineNumber = 1,
  [int]$NetworkPassword = 0,
  [int]$License = 1261,
  [int]$TimeoutMs = 5000,
  [string]$SdkDirectory = "",
  [string]$UserId = "",
  [string]$UserName = "",
  [string]$Password = "",
  [int]$Privilege = 0,
  [int]$Enabled = 1,
  [int]$CardNo = 0
)

$ErrorActionPreference = "Stop"
$handle = 0
if (-not $SdkDirectory) { $SdkDirectory = $PSScriptRoot }

function Write-Result([hashtable]$Value) {
  $Value | ConvertTo-Json -Depth 7 -Compress
}

try {
  $sdkDll = Join-Path $SdkDirectory "FK623Attend.dll"
  $modelDictionary = Join-Path $SdkDirectory "FKModelDic.ini"
  if (-not (Test-Path -LiteralPath $sdkDll)) {
    throw "Ronald Jack FK623Attend SDK not found at $sdkDll"
  }
  if (-not (Test-Path -LiteralPath $modelDictionary)) {
    throw "Ronald Jack model dictionary not found at $modelDictionary"
  }

  Set-Location -LiteralPath $SdkDirectory
  $escapedSdkDll = $sdkDll.Replace("\", "\\")
  $source = @"
using System;
using System.Runtime.InteropServices;

public static class Rj1300Native {
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool SetDllDirectory(string path);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_ConnectNet", ExactSpelling = true, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi)]
  public static extern int ConnectNet(int machineNumber, [MarshalAs(UnmanagedType.VBByRefStr)] ref string ip, int port, int timeoutMs, int protocol, int networkPassword, int license);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_DisConnect", ExactSpelling = true, CallingConvention = CallingConvention.Winapi)]
  public static extern void Disconnect(int handle);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_GetProductData", ExactSpelling = true, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi)]
  public static extern int GetProductData(int handle, int index, [MarshalAs(UnmanagedType.AnsiBStr)] ref string value);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_GetDeviceStatus", ExactSpelling = true, CallingConvention = CallingConvention.Winapi)]
  public static extern int GetDeviceStatus(int handle, int index, ref int value);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_ReadAllUserID", ExactSpelling = true, CallingConvention = CallingConvention.Winapi)]
  public static extern int ReadAllUserId(int handle);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_GetIsSupportStringID", ExactSpelling = true, CallingConvention = CallingConvention.Winapi)]
  public static extern int GetIsSupportStringId(int handle);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_GetAllUserID", ExactSpelling = true, CallingConvention = CallingConvention.Winapi)]
  public static extern int GetAllUserIdNumeric(int handle, ref uint userId, ref int backupNumber, ref int privilege, ref int enabled);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_GetAllUserID_StringID", ExactSpelling = true, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi)]
  public static extern int GetAllUserId(int handle, [MarshalAs(UnmanagedType.AnsiBStr)] ref string userId, ref int backupNumber, ref int privilege, ref int enabled);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_GetUserName_StringID", ExactSpelling = true, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi)]
  public static extern int GetUserName(int handle, [MarshalAs(UnmanagedType.VBByRefStr)] ref string userId, [MarshalAs(UnmanagedType.AnsiBStr)] ref string name);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_GetUserName", ExactSpelling = true, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi)]
  public static extern int GetUserNameNumeric(int handle, uint userId, [MarshalAs(UnmanagedType.AnsiBStr)] ref string name);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_SetUserInfoEx_StringID", ExactSpelling = true, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi)]
  public static extern int SetUserInfoEx(int handle, [MarshalAs(UnmanagedType.VBByRefStr)] ref string userId, int privilege, [MarshalAs(UnmanagedType.LPStr)] string password, [MarshalAs(UnmanagedType.LPStr)] string name, int enabled, int cardNo);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_SetUserInfoEx", ExactSpelling = true, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi)]
  public static extern int SetUserInfoExNumeric(int handle, uint userId, int privilege, [MarshalAs(UnmanagedType.LPStr)] string password, [MarshalAs(UnmanagedType.LPStr)] string name, int enabled, int cardNo);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_DeleteEnrollData_StringID", ExactSpelling = true, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi)]
  public static extern int DeleteEnrollData(int handle, [MarshalAs(UnmanagedType.VBByRefStr)] ref string userId, int backupNumber);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_DeleteEnrollData", ExactSpelling = true, CallingConvention = CallingConvention.Winapi)]
  public static extern int DeleteEnrollDataNumeric(int handle, uint userId, int backupNumber);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_LoadGeneralLogData", ExactSpelling = true, CallingConvention = CallingConvention.Winapi)]
  public static extern int LoadGeneralLogData(int handle, int readMark);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_GetGeneralLogData_StringID", ExactSpelling = true, CallingConvention = CallingConvention.Winapi, CharSet = CharSet.Ansi)]
  public static extern int GetGeneralLogData(int handle, [MarshalAs(UnmanagedType.AnsiBStr)] ref string userId, ref int verifyMode, ref int inOutMode, ref DateTime recordTime);

  [DllImport("$escapedSdkDll", EntryPoint = "FK_GetGeneralLogData", ExactSpelling = true, CallingConvention = CallingConvention.Winapi)]
  public static extern int GetGeneralLogDataNumeric(int handle, ref uint userId, ref int verifyMode, ref int inOutMode, ref DateTime recordTime);

  public static Rj1300UserRow NextUser(int handle, bool useStringId) {
    int backupNumber = 0, privilege = 0, enabled = 0;
    int code;
    string userId;
    if (useStringId) {
      userId = "";
      code = GetAllUserId(handle, ref userId, ref backupNumber, ref privilege, ref enabled);
    } else {
      uint numericUserId = 0;
      code = GetAllUserIdNumeric(handle, ref numericUserId, ref backupNumber, ref privilege, ref enabled);
      userId = numericUserId.ToString();
    }
    return new Rj1300UserRow { Code = code, UserId = userId ?? "", BackupNumber = backupNumber, Privilege = privilege, Enabled = enabled };
  }

  public static string ReadUserName(int handle, string userId, bool useStringId) {
    string name = "";
    if (useStringId) GetUserName(handle, ref userId, ref name);
    else GetUserNameNumeric(handle, UInt32.Parse(userId), ref name);
    return name ?? "";
  }

  public static int WriteUser(int handle, string userId, bool useStringId, int privilege, string password, string name, int enabled, int cardNo) {
    if (useStringId) return SetUserInfoEx(handle, ref userId, privilege, password ?? "", name ?? "", enabled, cardNo);
    return SetUserInfoExNumeric(handle, UInt32.Parse(userId), privilege, password ?? "", name ?? "", enabled, cardNo);
  }

  // FK backup number 12 is the SDK's all-enrolment selector: it removes every
  // credential associated with the user record, including password/card data.
  public static int DeleteUser(int handle, string userId, bool useStringId) {
    const int AllEnrollmentBackupNumber = 12;
    if (useStringId) return DeleteEnrollData(handle, ref userId, AllEnrollmentBackupNumber);
    return DeleteEnrollDataNumeric(handle, UInt32.Parse(userId), AllEnrollmentBackupNumber);
  }

  public static Rj1300LogRow NextLog(int handle, bool useStringId) {
    int verifyMode = 0, inOutMode = 0;
    DateTime recordTime = DateTime.MinValue;
    int code;
    string userId;
    if (useStringId) {
      userId = "";
      code = GetGeneralLogData(handle, ref userId, ref verifyMode, ref inOutMode, ref recordTime);
    } else {
      uint numericUserId = 0;
      code = GetGeneralLogDataNumeric(handle, ref numericUserId, ref verifyMode, ref inOutMode, ref recordTime);
      userId = numericUserId.ToString();
    }
    return new Rj1300LogRow { Code = code, UserId = userId ?? "", VerifyMode = verifyMode, InOutMode = inOutMode, RecordTime = recordTime };
  }
}

public sealed class Rj1300UserRow {
  public int Code;
  public string UserId;
  public int BackupNumber;
  public int Privilege;
  public int Enabled;
}

public sealed class Rj1300LogRow {
  public int Code;
  public string UserId;
  public int VerifyMode;
  public int InOutMode;
  public DateTime RecordTime;
}
"@
  Add-Type -TypeDefinition $source
  [void][Rj1300Native]::SetDllDirectory($SdkDirectory)

  $targetIp = $Ip.Trim()
  # Protocol 0 is TCP in the Ronald Jack SDK.
  $handle = [Rj1300Native]::ConnectNet($MachineNumber, [ref]$targetIp, $Port, $TimeoutMs, 0, $NetworkPassword, $License)
  if ($handle -le 0) {
    throw "FK_ConnectNet failed with SDK code $handle for ${Ip}:${Port} (device $MachineNumber)"
  }

  if ($Operation -eq "connect") {
    Write-Result @{ success = $true; connectionType = "ronald-jack-fk623"; handle = $handle; machineNumber = $MachineNumber }
    exit 0
  }

  if ($Operation -eq "metadata") {
    $serialNumber = ""
    $modelCode = ""
    $modelName = ""
    $userCount = 0
    $logCount = 0
    [void][Rj1300Native]::GetProductData($handle, 1, [ref]$serialNumber)
    [void][Rj1300Native]::GetProductData($handle, 3, [ref]$modelCode)
    [void][Rj1300Native]::GetProductData($handle, 4, [ref]$modelName)
    [void][Rj1300Native]::GetDeviceStatus($handle, 2, [ref]$userCount)
    [void][Rj1300Native]::GetDeviceStatus($handle, 1, [ref]$logCount)
    Write-Result @{
      success = $true
      serialNumber = $serialNumber.Trim()
      modelCode = $modelCode.Trim()
      modelName = $modelName.Trim()
      model = "RJ1300"
      userCount = $userCount
      logCount = $logCount
      sdk = "FK623Attend.dll"
    }
    exit 0
  }

  if ($Operation -eq "users") {
    $readResult = [Rj1300Native]::ReadAllUserId($handle)
    if ($readResult -le 0) { throw "FK_ReadAllUserID failed with SDK code $readResult" }
    $supportsStringId = [Rj1300Native]::GetIsSupportStringId($handle) -gt 0
    $usersById = @{}
    for ($index = 0; $index -lt 100000; $index++) {
      $row = [Rj1300Native]::NextUser($handle, $supportsStringId)
      if ($row.Code -le 0) { break }
      $userId = $row.UserId.Trim()
      if (-not $userId -or $usersById.ContainsKey($userId)) { continue }
      $name = [Rj1300Native]::ReadUserName($handle, $userId, $supportsStringId)
      $usersById[$userId] = [pscustomobject]@{
        uid = $userId
        user_id = $userId
        userid = $userId
        name = $name.Trim()
        role = $row.Privilege
        privilege = $row.Privilege
        enabled = $row.Enabled -ne 0
      }
    }
    Write-Result @{ success = $true; users = @($usersById.Values); count = $usersById.Count }
    exit 0
  }

  if ($Operation -eq "upsertUser") {
    $normalizedUserId = $UserId.Trim()
    $normalizedName = $UserName.Trim()
    if (-not $normalizedUserId) { throw "UserId is required for RJ1300 upsert" }
    if (-not $normalizedName) { throw "UserName is required for RJ1300 upsert" }
    $supportsStringId = [Rj1300Native]::GetIsSupportStringId($handle) -gt 0
    if (-not $supportsStringId -and $normalizedUserId -notmatch '^\d+$') {
      throw "This RJ1300 firmware requires a numeric UserId"
    }
    $writeResult = [Rj1300Native]::WriteUser($handle, $normalizedUserId, $supportsStringId, $Privilege, $Password, $normalizedName, $Enabled, $CardNo)
    if ($writeResult -le 0) { throw "FK_SetUserInfoEx failed with SDK code $writeResult for user $normalizedUserId" }
    Write-Result @{ success = $true; operation = "upsertUser"; userId = $normalizedUserId; name = $normalizedName; result = $writeResult }
    exit 0
  }

  if ($Operation -eq "deleteUser") {
    $normalizedUserId = $UserId.Trim()
    if (-not $normalizedUserId) { throw "UserId is required for RJ1300 delete" }
    $supportsStringId = [Rj1300Native]::GetIsSupportStringId($handle) -gt 0
    if (-not $supportsStringId -and $normalizedUserId -notmatch '^\d+$') {
      throw "This RJ1300 firmware requires a numeric UserId"
    }
    $deleteResult = [Rj1300Native]::DeleteUser($handle, $normalizedUserId, $supportsStringId)
    if ($deleteResult -le 0) { throw "FK_DeleteEnrollData failed with SDK code $deleteResult for user $normalizedUserId" }
    Write-Result @{ success = $true; operation = "deleteUser"; userId = $normalizedUserId; result = $deleteResult }
    exit 0
  }

  $loadResult = [Rj1300Native]::LoadGeneralLogData($handle, 0)
  if ($loadResult -le 0) { throw "FK_LoadGeneralLogData failed with SDK code $loadResult" }
  $supportsStringId = [Rj1300Native]::GetIsSupportStringId($handle) -gt 0
  $records = @()
  for ($index = 0; $index -lt 1000000; $index++) {
    $row = [Rj1300Native]::NextLog($handle, $supportsStringId)
    if ($row.Code -le 0) { break }
    $records += [pscustomobject]@{
      uid = $row.UserId.Trim()
      user_id = $row.UserId.Trim()
      userid = $row.UserId.Trim()
      record_time = $row.RecordTime.ToString("yyyy-MM-dd HH:mm:ss")
      timestamp = ([DateTimeOffset]$row.RecordTime).ToUnixTimeMilliseconds()
      verify_mode = $row.VerifyMode
      in_out_mode = $row.InOutMode
    }
  }
  Write-Result @{ success = $true; records = @($records); count = $records.Count }
} catch {
  Write-Result @{ success = $false; error = $_.Exception.Message }
  exit 1
} finally {
  if ($handle -gt 0) {
    try { [Rj1300Native]::Disconnect($handle) } catch {}
  }
}

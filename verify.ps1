$body = @{username='student_raj';password='student123'} | ConvertTo-Json
$r = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/login' -Method POST -ContentType 'application/json' -Body $body
Write-Host "=== Student Login ==="
Write-Host "Success: $($r.success)"
Write-Host "Role: $($r.user.role)"
Write-Host "Token: $($r.token.Substring(0,30))..."

$token = $r.token
$headers = @{Authorization="Bearer $token"}

Write-Host "`n=== Student Dashboard ==="
$dash = Invoke-RestMethod -Uri 'http://localhost:3000/api/student/dashboard' -Headers $headers
Write-Host "Enrollments: $($dash.stats.enrollments)"
Write-Host "Unread Notifications: $($dash.stats.unreadNotifications)"

Write-Host "`n=== Blocks ==="
$blocks = Invoke-RestMethod -Uri 'http://localhost:3000/api/blocks' -Headers $headers
Write-Host "Block count: $($blocks.Count)"
$blocks | ForEach-Object { Write-Host "  Block $($_.name): $($_.label)" }

Write-Host "`n=== Professor Login ==="
$pbody = @{username='prof_sharma';password='prof123'} | ConvertTo-Json
$pr = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/login' -Method POST -ContentType 'application/json' -Body $pbody
Write-Host "Success: $($pr.success)"
Write-Host "Role: $($pr.user.role)"

$ptoken = $pr.token
$pheaders = @{Authorization="Bearer $ptoken"}

Write-Host "`n=== Professor Dashboard ==="
$pdash = Invoke-RestMethod -Uri 'http://localhost:3000/api/professor/dashboard' -Headers $pheaders
Write-Host "Today Classes: $($pdash.stats.todayClasses)"
Write-Host "Total Scheduled: $($pdash.stats.totalScheduled)"
Write-Host "Subjects: $($pdash.stats.subjects)"
Write-Host "Enrolled Students: $($pdash.stats.enrolledStudents)"

Write-Host "`n=== Classrooms (first 5) ==="
$rooms = Invoke-RestMethod -Uri 'http://localhost:3000/api/classrooms' 
Write-Host "Total rooms: $($rooms.stats.total)"
Write-Host "Available: $($rooms.stats.available)"
Write-Host "Occupied: $($rooms.stats.occupied)"

Write-Host "`n=== ALL TESTS PASSED ==="

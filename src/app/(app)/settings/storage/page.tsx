'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type StorageType = 'local' | 'cos';

type Config = {
  type: StorageType;
  cos?: {
    secretId: string;
    secretKeyMasked: boolean;
    bucket: string;
    region: string;
    cdnDomain?: string;
  };
};

export default function StorageSettingsPage() {
  const [type, setType] = useState<StorageType>('local');
  const [secretId, setSecretId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [secretKeyMasked, setSecretKeyMasked] = useState(false);
  const [bucket, setBucket] = useState('');
  const [region, setRegion] = useState('');
  const [cdnDomain, setCdnDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch('/api/settings/storage')
      .then((r) => r.json())
      .then((data: Config) => {
        setType(data.type);
        if (data.cos) {
          setSecretId(data.cos.secretId);
          setSecretKeyMasked(data.cos.secretKeyMasked);
          setBucket(data.cos.bucket);
          setRegion(data.cos.region);
          setCdnDomain(data.cos.cdnDomain || '');
        }
      })
      .catch(() => toast.error('加载配置失败'));
  }, []);

  async function handleTest() {
    if (!secretId || !secretKey || !bucket || !region) {
      toast.error('请填写完整的 COS 配置');
      return;
    }

    setTesting(true);

    try {
      const res = await fetch('/api/settings/storage/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secretId, secretKey, bucket, region }),
      });

      const data = await res.json();

      if (data.ok) {
        toast.success(`连接成功 (${data.latencyMs}ms)`);
      } else {
        toast.error(`连接失败: ${data.message}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '测试失败');
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);

    try {
      const body: Record<string, unknown> =
        type === 'local'
          ? { type: 'local' }
          : {
              type: 'cos',
              cos: {
                secretId,
                ...(secretKey ? { secretKey } : {}),
                bucket,
                region,
                cdnDomain: cdnDomain || undefined,
              },
            };

      const res = await fetch('/api/settings/storage', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || '保存失败');
      }

      toast.success('已保存');
      setSecretKey('');
      setSecretKeyMasked(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">存储设置</h1>

      <Card className="space-y-4 p-4">
        <div className="space-y-2">
          <Label>存储类型</Label>
          <div className="flex gap-2">
            <button
              onClick={() => setType('local')}
              className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                type === 'local'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              本地存储
            </button>
            <button
              onClick={() => setType('cos')}
              className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                type === 'cos'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              腾讯云 COS
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {type === 'local'
              ? '文件保存在服务器本地的 data/uploads 目录'
              : '文件上传到腾讯云对象存储 COS'}
          </p>
        </div>

        {type === 'cos' && (
          <>
            <div className="space-y-2">
              <Label>SecretId</Label>
              <Input
                value={secretId}
                onChange={(e) => setSecretId(e.target.value)}
                placeholder="AKIDxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>

            <div className="space-y-2">
              <Label>
                SecretKey
                {secretKeyMasked && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    （已保存，留空则保持不变）
                  </span>
                )}
              </Label>
              <Input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={secretKeyMasked ? '••••••••' : '请输入 SecretKey'}
              />
            </div>

            <div className="space-y-2">
              <Label>Bucket</Label>
              <Input
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder="my-bucket-1234567890"
              />
            </div>

            <div className="space-y-2">
              <Label>Region</Label>
              <Input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="ap-shanghai"
              />
              <p className="text-xs text-muted-foreground">
                例如：ap-beijing、ap-shanghai、ap-guangzhou
              </p>
            </div>

            <div className="space-y-2">
              <Label>CDN 域名（可选）</Label>
              <Input
                value={cdnDomain}
                onChange={(e) => setCdnDomain(e.target.value)}
                placeholder="https://cdn.example.com"
              />
              <p className="text-xs text-muted-foreground">
                配置后，文件 URL 将使用 CDN 加速
              </p>
            </div>

            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || !secretKey}
            >
              {testing ? '测试中...' : '测试连接'}
            </Button>
          </>
        )}

        <div className="border-t pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium">提示</h2>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>· 切换存储类型不会迁移现有文件，已上传的文件仍存在原位置</li>
          <li>
            · 使用 COS 时建议同时配置 CDN 域名以加速访问
          </li>
          <li>
            · SecretId/SecretKey 在
            <a
              href="https://console.cloud.tencent.com/cam/capi"
              target="_blank"
              rel="noopener noreferrer"
              className="mx-1 underline"
            >
              腾讯云控制台
            </a>
            获取
          </li>
        </ul>
      </Card>
    </div>
  );
}

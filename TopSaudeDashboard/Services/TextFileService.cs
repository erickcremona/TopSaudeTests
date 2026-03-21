using System.Text;

namespace TopSaudeDashboard.Services;

public sealed class TextFileService
{
    private static readonly Encoding Windows1252 = Encoding.GetEncoding(1252);

    public (string Content, Encoding Encoding) ReadTextAuto(string absolutePath)
    {
        if (!File.Exists(absolutePath))
            throw new FileNotFoundException("Arquivo nao encontrado.", absolutePath);

        var bytes = File.ReadAllBytes(absolutePath);

        // UTF-8 BOM
        if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
            return (Encoding.UTF8.GetString(bytes), Encoding.UTF8);

        if (TryDecodeStrict(bytes, Encoding.UTF8, out var utf8Text))
            return (utf8Text, Encoding.UTF8);

        return (Windows1252.GetString(bytes), Windows1252);
    }

    public void WriteTextPreservingEncoding(string absolutePath, string content)
    {
        Encoding encoding;
        if (File.Exists(absolutePath))
        {
            (_, encoding) = ReadTextAuto(absolutePath);
        }
        else
        {
            encoding = Encoding.UTF8;
        }

        WriteText(absolutePath, content, encoding);
    }

    public void WriteText(string absolutePath, string content, Encoding encoding)
    {
        var directory = Path.GetDirectoryName(absolutePath);
        if (!string.IsNullOrWhiteSpace(directory))
            Directory.CreateDirectory(directory);

        File.WriteAllText(absolutePath, content ?? string.Empty, encoding);
    }

    private static bool TryDecodeStrict(byte[] bytes, Encoding encoding, out string text)
    {
        try
        {
            var strict = Encoding.GetEncoding(
                encoding.WebName,
                EncoderFallback.ExceptionFallback,
                DecoderFallback.ExceptionFallback);

            text = strict.GetString(bytes);
            return true;
        }
        catch
        {
            text = string.Empty;
            return false;
        }
    }
}

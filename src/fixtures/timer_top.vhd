library ieee;
use ieee.std_logic_1164.all;

entity timer_top is
  port (
    CLOCK_50                 : in  std_logic;
    run_btn_n                : in  std_logic;
    reset_btn_n              : in  std_logic;
    mode_btn_n               : in  std_logic;
    increment_btn_n          : in  std_logic;
    count_down               : in  std_logic; -- '1' = regressiva, '0' = progressiva
    HEX0                     : out std_logic_vector(6 downto 0);
    HEX1                     : out std_logic_vector(6 downto 0);
    HEX2                     : out std_logic_vector(6 downto 0);
    HEX3                     : out std_logic_vector(6 downto 0);
    LEDG                     : out std_logic_vector(7 downto 0);
    LEDR                     : out std_logic_vector(9 downto 0)
  );
end entity;

architecture rtl of timer_top is
  constant CLOCK_FREQ_HZ                : natural := 50_000_000;
  constant QUARTER_SECOND_CYCLES        : natural := CLOCK_FREQ_HZ / 4;
  constant HALF_SECOND_CYCLES           : natural := CLOCK_FREQ_HZ / 2;
  constant THREE_QUARTER_SECOND_CYCLES  : natural := (CLOCK_FREQ_HZ * 3) / 4;

  type timer_mode_t is (
    IDLE,
    RUNNING,
    SETTING_HOURS,
    SETTING_MINUTES,
    SETTING_SECONDS,
    FINISHED
  );

  signal hours   : natural range 0 to 24 := 0;
  signal minutes : natural range 0 to 59 := 0;
  signal seconds : natural range 0 to 59 := 0;

  signal preset_hours   : natural range 0 to 24 := 0;
  signal preset_minutes : natural range 0 to 59 := 0;
  signal preset_seconds : natural range 0 to 59 := 0;

  signal mode                      : timer_mode_t := IDLE;
  signal visible_phase             : std_logic := '1';
  signal cycles_since_last_second  : natural range 0 to CLOCK_FREQ_HZ - 1 := 0;
  signal run_consumed              : std_logic := '0';
  signal reset_consumed            : std_logic := '0';
  signal mode_consumed             : std_logic := '0';
  signal increment_consumed        : std_logic := '0';

  function seven_segments(digit : natural) return std_logic_vector is
  begin
    case digit is
      when 0      => return "1000000";
      when 1      => return "1111001";
      when 2      => return "0100100";
      when 3      => return "0110000";
      when 4      => return "0011001";
      when 5      => return "0010010";
      when 6      => return "0000010";
      when 7      => return "1111000";
      when 8      => return "0000000";
      when 9      => return "0010000";
      when others => return "1111111";
    end case;
  end function;

  function tens_of(value : natural) return natural is
  begin
    return value / 10;
  end function;

  function units_of(value : natural) return natural is
  begin
    return value mod 10;
  end function;

begin
  process (CLOCK_50)
    variable second_elapsed        : boolean;

    procedure increment_selected_field is
      variable next_hours   : natural range 0 to 24;
      variable next_minutes : natural range 0 to 59;
      variable next_seconds : natural range 0 to 59;
    begin
      next_hours   := hours;
      next_minutes := minutes;
      next_seconds := seconds;

      case mode is
        when SETTING_HOURS =>
          if hours = 24 then
            next_hours   := 0;
            next_minutes := 0;
            next_seconds := 0;
          elsif hours = 23 then
            next_hours   := 24;
            next_minutes := 0;
            next_seconds := 0;
          else
            next_hours := hours + 1;
          end if;

        when SETTING_MINUTES =>
          if hours = 24 then
            next_hours   := 0;
            next_minutes := 1;
            next_seconds := 0;
          elsif minutes = 59 then
            next_minutes := 0;
          else
            next_minutes := minutes + 1;
          end if;

        when SETTING_SECONDS =>
          if hours = 24 then
            next_hours   := 0;
            next_minutes := 0;
            next_seconds := 1;
          elsif seconds = 59 then
            next_seconds := 0;
          else
            next_seconds := seconds + 1;
          end if;

        when others =>
          null;
      end case;

      hours                   <= next_hours;
      minutes                 <= next_minutes;
      seconds                 <= next_seconds;
      preset_hours           <= next_hours;
      preset_minutes         <= next_minutes;
      preset_seconds         <= next_seconds;
      visible_phase           <= '1';
    end procedure;

    procedure count_one_second_down is
    begin
      if hours = 0 and minutes = 0 and seconds <= 1 then
        hours         <= 0;
        minutes       <= 0;
        seconds       <= 0;
        mode          <= FINISHED;
        visible_phase <= '1';
      elsif seconds = 0 then
        seconds <= 59;

        if minutes = 0 then
          minutes <= 59;
          hours   <= hours - 1;
        else
          minutes <= minutes - 1;
        end if;
      else
        seconds <= seconds - 1;
      end if;
    end procedure;

    procedure count_one_second_up is
    begin
      if hours = 24 or
         (hours = 23 and minutes = 59 and seconds = 59) then
        hours         <= 24;
        minutes       <= 0;
        seconds       <= 0;
        mode          <= FINISHED;
        visible_phase <= '1';
      elsif seconds = 59 then
        seconds <= 0;

        if minutes = 59 then
          minutes <= 0;
          hours   <= hours + 1;
        else
          minutes <= minutes + 1;
        end if;
      else
        seconds <= seconds + 1;
      end if;
    end procedure;
  begin
    if rising_edge(CLOCK_50) then
      -- Conta ciclos do clock de 50 MHz para gerar 1 segundo e piscar a cada quarto de segundo.
      second_elapsed := false;
      if cycles_since_last_second = CLOCK_FREQ_HZ - 1 then
        cycles_since_last_second <= 0;
        visible_phase <= not visible_phase;
        second_elapsed := true;
      else
        cycles_since_last_second <= cycles_since_last_second + 1;

        if cycles_since_last_second = QUARTER_SECOND_CYCLES - 1 or
           cycles_since_last_second = HALF_SECOND_CYCLES - 1 or
           cycles_since_last_second = THREE_QUARTER_SECOND_CYCLES - 1 then
          visible_phase <= not visible_phase;
        end if;
      end if;

      -- Run pausa quando esta rodando e inicia quando esta parado.
      if reset_btn_n = '0' and reset_consumed = '0' then
        reset_consumed <= '1';

        if count_down = '1' then
          hours   <= preset_hours;
          minutes <= preset_minutes;
          seconds <= preset_seconds;
        else
          hours   <= 0;
          minutes <= 0;
          seconds <= 0;
        end if;

        mode <= IDLE;
        visible_phase <= '1';
        cycles_since_last_second <= 0;

      elsif run_btn_n = '0' and run_consumed = '0' then
        run_consumed <= '1';

        if mode = RUNNING then
          mode <= IDLE;
        elsif (count_down = '1' and hours = 0 and minutes = 0 and seconds = 0) or
              (count_down = '0' and hours = 24) then
          mode <= FINISHED;
        else
          mode <= RUNNING;
          cycles_since_last_second <= 0;
        end if;

        visible_phase <= '1';

      -- O botao de selecao escolhe qual campo sera ajustado.
      elsif mode_btn_n = '0' and mode_consumed = '0' then
        mode_consumed <= '1';

        case mode is
          when IDLE | FINISHED => mode <= SETTING_HOURS;
          when SETTING_HOURS   => mode <= SETTING_MINUTES;
          when SETTING_MINUTES => mode <= SETTING_SECONDS;
          when SETTING_SECONDS => mode <= IDLE;
          when others          => null;
        end case;

        visible_phase <= '1';

      -- No modo de ajuste, o incremento altera o campo selecionado e salva o preset regressivo.
      elsif increment_btn_n = '0' and increment_consumed = '0' then
        increment_consumed <= '1';

        if mode = SETTING_HOURS or mode = SETTING_MINUTES or mode = SETTING_SECONDS then
          increment_selected_field;
        end if;

      elsif second_elapsed and mode = RUNNING then
        if count_down = '1' then
          -- Contagem regressiva: para em 00:00:00 e pisca os LEDs.
          count_one_second_down;
        else
          -- Contagem progressiva: para em 24:00:00 e pisca os LEDs.
          count_one_second_up;
        end if;
      end if;

      if run_btn_n = '1' then
        run_consumed <= '0';
      end if;

      if reset_btn_n = '1' then
        reset_consumed <= '0';
      end if;

      if mode_btn_n = '1' then
        mode_consumed <= '0';
      end if;

      if increment_btn_n = '1' then
        increment_consumed <= '0';
      end if;
    end if;
  end process;

  render_outputs : process (hours, minutes, seconds, mode, visible_phase)
    variable hide_hours       : boolean;
    variable hide_minutes     : boolean;
    variable hide_seconds     : boolean;
    variable seconds_tens      : natural range 0 to 5;
    variable seconds_units     : natural range 0 to 9;
    variable seconds_tens_bar  : std_logic_vector(1 to 6);
    variable separator_leds    : std_logic_vector(1 to 3);
    variable seconds_units_bar : std_logic_vector(9 downto 1);
  begin
    hide_hours       := false;
    hide_minutes     := false;
    hide_seconds     := false;
    seconds_tens      := tens_of(seconds);
    seconds_units     := units_of(seconds);
    seconds_tens_bar  := (others => '0');
    separator_leds    := (others => '0');
    seconds_units_bar := (others => '0');

    if visible_phase = '0' then
      hide_hours   := mode = SETTING_HOURS;
      hide_minutes := mode = SETTING_MINUTES;
      hide_seconds := mode = SETTING_SECONDS;
    end if;

    -- HEX e ativo em zero: '0' acende o segmento.
    -- O display mostra HH:MM; os segundos aparecem nas barras de LED.
    if hide_hours then
      HEX3 <= "1111111";
      HEX2 <= "1111111";
    else
      HEX3 <= seven_segments(tens_of(hours));
      HEX2 <= seven_segments(units_of(hours));
    end if;

    if hide_minutes then
      HEX1 <= "1111111";
      HEX0 <= "1111111";
    else
      HEX1 <= seven_segments(tens_of(minutes));
      HEX0 <= seven_segments(units_of(minutes));
    end if;

    if mode = FINISHED then
      if visible_phase = '1' then
        separator_leds := "111";
      end if;
    elsif not hide_seconds then
      for pos in seconds_tens_bar'range loop
        if pos <= seconds_tens then
          seconds_tens_bar(pos) := '1';
        end if;
      end loop;

      for pos in seconds_units_bar'range loop
        if pos <= seconds_units then
          seconds_units_bar(pos) := '1';
        end if;
      end loop;
    end if;

    -- Na concatenacao, o primeiro item a esquerda do "&" vai para o lado mais
    -- significativo do vetor de destino; em LEDR(9 downto 0), isso comeca por LEDR9.
    LEDR <= seconds_tens_bar & separator_leds & seconds_units_bar(9);
    LEDG <= seconds_units_bar(8 downto 1);
  end process render_outputs;
end architecture;
